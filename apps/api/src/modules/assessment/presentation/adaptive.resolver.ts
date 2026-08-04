import { Database, schema } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';

import { CourseOwnershipService } from '../../../core/authz/course-ownership.service';
import { DATABASE } from '../../../core/database/database.module';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { CalibrateItemCommand } from '../application/commands/calibrate-item.command';
import { RunDiagnosticCommand } from '../application/commands/run-diagnostic.command';
import { StartAdaptiveExamCommand } from '../application/commands/start-adaptive-exam.command';
import { SubmitAdaptiveAnswerCommand } from '../application/commands/submit-adaptive-answer.command';
import { DrizzleAdaptiveRepository } from '../infrastructure/drizzle-adaptive.repository';

import {
  AdaptiveReportType,
  AdaptiveStepType,
  CalibrationResultType,
  CourseCompetencyMasteryType,
  CourseItemBankHealthType,
} from './dto/adaptive.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class AdaptiveResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly repo: DrizzleAdaptiveRepository,
    private readonly courseOwnership: CourseOwnershipService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  // ---------- Estudiante: rendir CAT ----------

  @Mutation(() => AdaptiveStepType)
  startAdaptiveExam(
    @Args('evaluationId') evaluationId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(
      new StartAdaptiveExamCommand(evaluationId, user.sub, enrollmentId),
    );
  }

  @Mutation(() => AdaptiveStepType)
  submitAdaptiveAnswer(
    @Args('attemptId') attemptId: string,
    @Args('questionId') questionId: string,
    @Args('answer') answer: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(
      new SubmitAdaptiveAnswerCommand(attemptId, user.sub, questionId, answer),
    );
  }

  @Mutation(() => AdaptiveStepType)
  startDiagnostic(
    @Args('courseId') courseId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(new RunDiagnosticCommand(courseId, user.sub, enrollmentId));
  }

  // ---------- Estudiante: informe adaptativo ----------

  @Query(() => AdaptiveReportType)
  async myAdaptiveReport(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveReportType> {
    return this.buildReport(user.sub, courseId);
  }

  // ---------- Docente: informe de un estudiante ----------

  @Query(() => AdaptiveReportType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async studentAdaptiveReport(
    @Args('courseId') courseId: string,
    @Args('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveReportType> {
    await this.courseOwnership.assertOwnership(courseId, user);
    return this.buildReport(studentId, courseId);
  }

  // ---------- Docente: dominio por competencia del curso ----------

  @Query(() => [CourseCompetencyMasteryType])
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async courseCompetencyMastery(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
    // Segmentación por gestión (1 = 1.º · 2 = 2.º). Sin valor = todas las
    // gestiones vigentes (egresados siempre excluidos).
    @Args('cohortYear', { type: () => Int, nullable: true }) cohortYear?: number,
  ): Promise<CourseCompetencyMasteryType[]> {
    await this.courseOwnership.assertOwnership(courseId, user);
    const rows = await this.repo.getCourseCompetencyMastery(courseId, cohortYear);
    return rows.map((r) => ({
      competencyId: r.competencyId,
      code: r.code,
      name: r.name,
      avgMastery: Number(r.avgMastery),
      studentsTracked: Number(r.studentsTracked),
      studentsAtRisk: Number(r.studentsAtRisk),
      studentsMastered: Number(r.studentsMastered),
    }));
  }

  // ---------- Docente: salud del banco de ítems ----------

  @Query(() => CourseItemBankHealthType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async courseItemBankHealth(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseItemBankHealthType> {
    await this.courseOwnership.assertOwnership(courseId, user);
    const { perCompetency, courseTotals } = await this.repo.getCourseItemBankHealth(courseId);
    const totalItems = Number(courseTotals.totalItems);
    const calibratedItems = Number(courseTotals.calibratedItems);
    return {
      courseId,
      totalItems,
      calibratedItems,
      calibrationRate: totalItems > 0 ? calibratedItems / totalItems : 0,
      competencies: perCompetency.map((r) => ({
        competencyId: r.competencyId,
        code: r.code,
        name: r.name,
        totalItems: Number(r.totalItems),
        calibratedItems: Number(r.calibratedItems),
        itemsNeedingResponses: Number(r.itemsNeedingResponses),
        easyItems: Number(r.easyItems),
        mediumItems: Number(r.mediumItems),
        hardItems: Number(r.hardItems),
        avgDifficultyB: r.avgDifficultyB != null ? Number(r.avgDifficultyB) : null,
      })),
    };
  }

  // ---------- Docente: calibrar ítem ----------

  @Mutation(() => CalibrationResultType)
  @RequirePermissions(PERMISSIONS.EVALUATION_MANAGE)
  async calibrateItem(
    @Args('questionId') questionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CalibrationResultType> {
    const [q] = await this.db
      .select({ courseId: schema.evaluations.courseId })
      .from(schema.evaluationQuestions)
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluationQuestions.evaluationId, schema.evaluations.id),
      )
      .where(eq(schema.evaluationQuestions.id, questionId))
      .limit(1);
    if (!q) throw new Error('Pregunta no encontrada');
    await this.courseOwnership.assertOwnership(q.courseId, user);
    return this.commandBus.execute(new CalibrateItemCommand(questionId));
  }

  private async buildReport(userId: string, courseId: string): Promise<AdaptiveReportType> {
    const [rows, global, itemDifficulties] = await Promise.all([
      this.repo.getReportRows(userId, courseId),
      this.repo.getGlobalAbility(userId),
      this.repo.getCourseItemDifficulties(courseId),
    ]);
    return {
      userId,
      courseId,
      globalTheta: global ? Number(global.theta) : null,
      globalSe: global ? Number(global.se) : null,
      itemDifficulties,
      competencies: rows.map((r) => ({
        competencyId: r.competencyId,
        code: r.code,
        name: r.name,
        mastery: r.mastery != null ? Number(r.mastery) : 0,
        status: r.status ?? 'no_iniciada',
        theta: r.theta != null ? Number(r.theta) : null,
        se: r.se != null ? Number(r.se) : null,
      })),
    };
  }
}
