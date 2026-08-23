import { Database } from '@cieba/db';
import { schema } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Float, Mutation, Query, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';

import { CourseOwnershipService } from '../../../core/authz/course-ownership.service';
import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { GradeOpenAnswerCommand } from '../application/commands/grade-open-answer.command';
import { GradeStudentCommand } from '../application/commands/grade-student.command';
import { StartEvaluationCommand } from '../application/commands/start-evaluation.command';
import { SubmitEvaluationCommand } from '../application/commands/submit-evaluation.command';
import {
  ANSWER_FEEDBACK_SUGGESTER,
  AnswerFeedbackSuggesterPort,
} from '../domain/ports/answer-feedback-suggester.port';
import { QUESTION_SUGGESTER, QuestionSuggesterPort } from '../domain/ports/question-suggester.port';
import { DrizzleEvaluationRepository } from '../infrastructure/drizzle-evaluation.repository';
import { DrizzleGradeRepository } from '../infrastructure/drizzle-grade.repository';

import {
  AddQuestionInput,
  CreateEvaluationInput,
  GradeStudentInput,
  SubmitEvaluationInput,
  SuggestQuestionsInput,
} from './dto/assessment.input';
import {
  EvaluationAttemptType,
  EvaluationQuestionType,
  EvaluationType,
  GradeType,
  PendingOpenAnswerType,
  SuggestedQuestionType,
} from './dto/assessment.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class AssessmentResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly grades: DrizzleGradeRepository,
    private readonly evaluations: DrizzleEvaluationRepository,
    private readonly courseOwnership: CourseOwnershipService,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
    @Inject(QUESTION_SUGGESTER) private readonly questionSuggester: QuestionSuggesterPort,
    @Inject(ANSWER_FEEDBACK_SUGGESTER)
    private readonly answerFeedbackSuggester: AnswerFeedbackSuggesterPort,
  ) {}

  private async assertEvaluationOwnership(evaluationId: string, user: JwtPayload): Promise<void> {
    const [row] = await this.db
      .select({ courseId: schema.evaluations.courseId })
      .from(schema.evaluations)
      .where(eq(schema.evaluations.id, evaluationId))
      .limit(1);
    if (!row) throw new NotFoundException('Evaluación no encontrada');
    await this.courseOwnership.assertOwnership(row.courseId, user);
  }

  // ---------- Grades ----------
  @Query(() => [GradeType])
  myGrades(
    @CurrentUser() user: JwtPayload,
    @Args('courseId', { nullable: true }) courseId?: string,
  ): Promise<GradeType[]> {
    return this.grades.listByStudent(user.sub, courseId) as unknown as Promise<GradeType[]>;
  }

  @Mutation(() => GradeType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async gradeStudent(
    @Args('input') input: GradeStudentInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<GradeType> {
    const grade = (await this.commandBus.execute(
      new GradeStudentCommand({ ...input, teacherId: user.sub }),
    )) as GradeType;
    await this.audit
      .log({
        userId: user.sub,
        action: 'create',
        entityType: 'grade',
        entityId: grade.id,
        metadata: {
          description: `Nota registrada: ${grade.title} (${grade.score}/${grade.maxScore})`,
          studentId: grade.studentId,
          courseId: grade.courseId,
          score: grade.score,
        },
      })
      .catch(() => {});
    return grade;
  }

  // ---------- Evaluations ----------
  @Query(() => [EvaluationType])
  async courseEvaluations(@Args('courseId') courseId: string): Promise<EvaluationType[]> {
    const rows = await this.evaluations.listByCourse(courseId);
    return rows as unknown as EvaluationType[];
  }

  @Query(() => EvaluationType, { nullable: true })
  async evaluation(@Args('id') id: string): Promise<EvaluationType | null> {
    const row = await this.evaluations.findById(id);
    return row as unknown as EvaluationType | null;
  }

  @Query(() => [EvaluationQuestionType])
  async evaluationQuestions(
    @Args('evaluationId') evaluationId: string,
  ): Promise<EvaluationQuestionType[]> {
    const rows = await this.evaluations.listQuestions(evaluationId);
    // Ocultar qué opción es correcta al estudiante
    return rows.map((r) => ({
      ...r,
      options: r.options?.map((o) => ({ id: o.id, text: o.text })),
    })) as unknown as EvaluationQuestionType[];
  }

  @Mutation(() => EvaluationType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async createEvaluation(
    @Args('input') input: CreateEvaluationInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<EvaluationType> {
    await this.courseOwnership.assertOwnership(input.courseId, user);
    const row = await this.evaluations.create({ ...input, createdBy: user.sub });
    await this.audit
      .log({
        userId: user.sub,
        action: 'create',
        entityType: 'evaluation',
        entityId: row.id,
        metadata: {
          description: `Evaluación creada: ${row.title}`,
          courseId: input.courseId,
          title: row.title,
        },
      })
      .catch(() => {});
    return row as unknown as EvaluationType;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async deleteEvaluation(
    @Args('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertEvaluationOwnership(id, user);
    await this.db.delete(schema.evaluations).where(eq(schema.evaluations.id, id));
    await this.audit
      .log({
        userId: user.sub,
        action: 'delete',
        entityType: 'evaluation',
        entityId: id,
        metadata: { description: 'Evaluación eliminada', evaluationId: id },
      })
      .catch(() => {});
    return true;
  }

  @Mutation(() => EvaluationQuestionType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async addEvaluationQuestion(
    @Args('input') input: AddQuestionInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<EvaluationQuestionType> {
    await this.assertEvaluationOwnership(input.evaluationId, user);
    const row = await this.evaluations.addQuestion(input);
    return row as unknown as EvaluationQuestionType;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async deleteEvaluationQuestion(
    @Args('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    const [q] = await this.db
      .select({ evaluationId: schema.evaluationQuestions.evaluationId })
      .from(schema.evaluationQuestions)
      .where(eq(schema.evaluationQuestions.id, id))
      .limit(1);
    if (!q) throw new Error('Pregunta no encontrada');
    await this.assertEvaluationOwnership(q.evaluationId, user);
    await this.db.delete(schema.evaluationQuestions).where(eq(schema.evaluationQuestions.id, id));
    return true;
  }

  /** Versión "docente" que incluye todas las opciones (con isCorrect) — para edición. */
  @Query(() => [EvaluationQuestionType])
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async evaluationQuestionsForOwner(
    @Args('evaluationId') evaluationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EvaluationQuestionType[]> {
    await this.assertEvaluationOwnership(evaluationId, user);
    const rows = await this.evaluations.listQuestions(evaluationId);
    return rows as unknown as EvaluationQuestionType[];
  }

  /**
   * PROPONE borradores de preguntas con apoyo de IA para que el docente los
   * revise/edite antes de crearlos con `addEvaluationQuestion`. Nunca persiste
   * ni publica nada. Devuelve `[]` si la IA está deshabilitada o falla, de modo
   * que la pantalla sigue funcionando con alta manual (degradación elegante).
   */
  @Query(() => [SuggestedQuestionType])
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async suggestEvaluationQuestions(
    @Args('input') input: SuggestQuestionsInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<SuggestedQuestionType[]> {
    await this.courseOwnership.assertOwnership(input.courseId, user);

    let topic = input.topic?.trim() ?? '';
    if (input.lessonId) {
      const [lesson] = await this.db
        .select({
          title: schema.lessons.title,
          content: schema.lessons.content,
        })
        .from(schema.lessons)
        .where(eq(schema.lessons.id, input.lessonId))
        .limit(1);
      if (lesson) {
        topic = [lesson.title, lesson.content ?? ''].filter(Boolean).join('\n\n').trim();
      }
    }
    if (!topic) return [];

    const suggestions = await this.questionSuggester.suggest({
      topic,
      questionType: input.questionType ?? 'multiple_choice',
      difficulty: input.difficulty ?? 'medium',
      count: input.count ?? 3,
    });

    return suggestions as unknown as SuggestedQuestionType[];
  }

  @Mutation(() => EvaluationAttemptType)
  async startEvaluation(
    @Args('evaluationId') evaluationId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EvaluationAttemptType> {
    const row = await this.commandBus.execute(
      new StartEvaluationCommand(evaluationId, user.sub, enrollmentId),
    );
    return row as EvaluationAttemptType;
  }

  @Mutation(() => EvaluationAttemptType)
  async submitEvaluation(
    @Args('input') input: SubmitEvaluationInput,
  ): Promise<EvaluationAttemptType> {
    const row = await this.commandBus.execute(
      new SubmitEvaluationCommand(input.attemptId, input.answers),
    );
    return row as EvaluationAttemptType;
  }

  /** Intentos del estudiante para una evaluación (para conocer cuántos usó,
   *  si aprobó y cuántos le quedan). */
  @Query(() => [EvaluationAttemptType])
  async myEvaluationAttempts(
    @Args('evaluationId') evaluationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EvaluationAttemptType[]> {
    const rows = await this.evaluations.listAttemptsByStudentEvaluation(evaluationId, user.sub);
    return rows as unknown as EvaluationAttemptType[];
  }

  /** Bandeja del docente: respuestas abiertas pendientes de calificar en un curso. */
  @Query(() => [PendingOpenAnswerType])
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async coursePendingAnswers(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PendingOpenAnswerType[]> {
    await this.courseOwnership.assertOwnership(courseId, user);
    const rows = await this.evaluations.listPendingOpenAnswers(courseId);
    return rows.map((r) => ({
      answerId: r.answerId,
      attemptId: r.attemptId,
      evaluationId: r.evaluationId,
      evaluationTitle: r.evaluationTitle,
      questionId: r.questionId,
      questionText: r.questionText,
      maxPoints: String(r.maxPoints),
      answer: r.answer,
      studentId: r.studentId,
      studentName: `${r.studentFirstName} ${r.studentLastName}`.trim(),
      enrollmentId: r.enrollmentId,
      courseId: r.courseId,
      submittedAt: r.submittedAt,
    })) as PendingOpenAnswerType[];
  }

  /** Califica una respuesta abierta, recalcula el score del intento y propaga
   *  el juicio del docente al motor de competencias (BKT, umbral 50%). Acepta
   *  retroalimentación opcional que se guarda con la respuesta. */
  @Mutation(() => EvaluationAttemptType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async gradeOpenAnswer(
    @Args('answerId') answerId: string,
    @Args('points', { type: () => Float }) points: number,
    @CurrentUser() user: JwtPayload,
    @Args('feedback', { nullable: true }) feedback?: string,
  ): Promise<EvaluationAttemptType> {
    const courseId = await this.evaluations.getAnswerEvaluationCourse(answerId);
    if (!courseId) throw new NotFoundException('Respuesta no encontrada');
    await this.courseOwnership.assertOwnership(courseId, user);
    const updated = await this.commandBus.execute(
      new GradeOpenAnswerCommand(answerId, points, feedback),
    );
    return updated as EvaluationAttemptType;
  }

  /** PROPONE con IA un borrador de retroalimentación para una respuesta abierta.
   *  El docente lo revisa/edita antes de guardarlo con `gradeOpenAnswer`. Devuelve
   *  `null` si la IA está deshabilitada o no puede proponer (degradación elegante). */
  @Query(() => String, { nullable: true })
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async suggestOpenAnswerFeedback(
    @Args('answerId') answerId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<string | null> {
    const courseId = await this.evaluations.getAnswerEvaluationCourse(answerId);
    if (!courseId) throw new NotFoundException('Respuesta no encontrada');
    await this.courseOwnership.assertOwnership(courseId, user);

    const ctx = await this.evaluations.getAnswerFeedbackContext(answerId);
    if (!ctx) return null;

    return this.answerFeedbackSuggester.suggestFeedback({
      questionText: ctx.questionText,
      studentAnswer: ctx.studentAnswer ?? '',
      expectedAnswer: ctx.correctAnswer,
      maxPoints: Number(ctx.maxPoints),
    });
  }
}
