import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

/** Entrada del snapshot de respuestas del flujo leveled. */
export interface LeveledAnswer {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
}

@Injectable()
export class DrizzleEvaluationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.id, id))
      .limit(1);
    return row ?? null;
  }

  async listByCourse(courseId: string) {
    return this.db
      .select()
      .from(schema.evaluations)
      .where(and(eq(schema.evaluations.courseId, courseId), eq(schema.evaluations.isActive, true)))
      .orderBy(desc(schema.evaluations.createdAt));
  }

  async create(input: {
    courseId: string;
    lessonId?: string;
    createdBy: string;
    title: string;
    description?: string;
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
    timeLimitMinutes?: number;
    passingScore?: number;
    maxAttempts?: number;
    isAiGenerated?: boolean;
  }) {
    const [row] = await this.db
      .insert(schema.evaluations)
      .values({
        ...input,
        passingScore: String(input.passingScore ?? 60),
      })
      .returning();
    return row!;
  }

  // ---------- Questions ----------
  async addQuestion(input: {
    evaluationId: string;
    questionText: string;
    questionType: string;
    options?: Array<{ id: string; text: string; isCorrect: boolean }>;
    correctAnswer?: string;
    explanation?: string;
    points?: number;
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
    position?: number;
  }) {
    const [row] = await this.db
      .insert(schema.evaluationQuestions)
      .values({ ...input, points: String(input.points ?? 1) })
      .returning();
    return row!;
  }

  async listQuestions(evaluationId: string) {
    return this.db
      .select()
      .from(schema.evaluationQuestions)
      .where(eq(schema.evaluationQuestions.evaluationId, evaluationId))
      .orderBy(asc(schema.evaluationQuestions.position));
  }

  // ---------- Attempts ----------
  async createAttempt(input: {
    evaluationId: string;
    studentId: string;
    enrollmentId: string;
    attemptNumber: number;
  }) {
    const [row] = await this.db.insert(schema.evaluationAttempts).values(input).returning();
    return row!;
  }

  async countAttempts(evaluationId: string, studentId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(
        and(
          eq(schema.evaluationAttempts.evaluationId, evaluationId),
          eq(schema.evaluationAttempts.studentId, studentId),
        ),
      );
    return rows.length;
  }

  /** Intentos ya ENVIADOS (los abandonados sin enviar no cuentan para el límite). */
  async countSubmittedAttempts(evaluationId: string, studentId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(
        and(
          eq(schema.evaluationAttempts.evaluationId, evaluationId),
          eq(schema.evaluationAttempts.studentId, studentId),
        ),
      );
    return rows.filter((r) => r.submittedAt != null).length;
  }

  /** Intento abierto (sin enviar) del estudiante para reutilizar en vez de crear otro. */
  async findOpenAttempt(evaluationId: string, studentId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(
        and(
          eq(schema.evaluationAttempts.evaluationId, evaluationId),
          eq(schema.evaluationAttempts.studentId, studentId),
          isNull(schema.evaluationAttempts.submittedAt),
        ),
      )
      .orderBy(desc(schema.evaluationAttempts.startedAt))
      .limit(1);
    return row ?? null;
  }

  async submitAttempt(input: {
    attemptId: string;
    answers: Array<{ questionId: string; answer: string }>;
  }) {
    const questions = await this.db
      .select()
      .from(schema.evaluationQuestions)
      .where(
        eq(
          schema.evaluationQuestions.id,
          input.answers[0]?.questionId ?? '00000000-0000-0000-0000-000000000000',
        ),
      );

    const questionMap = new Map<string, (typeof questions)[0]>();
    for (const q of questions) questionMap.set(q.id, q);

    // Reload all questions of this attempt's evaluation
    const [attempt] = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(eq(schema.evaluationAttempts.id, input.attemptId))
      .limit(1);
    if (!attempt) throw new Error('Attempt not found');

    const allQuestions = await this.listQuestions(attempt.evaluationId);
    for (const q of allQuestions) questionMap.set(q.id, q);

    let totalScore = 0;
    let maxScore = 0;

    for (const q of allQuestions) {
      maxScore += Number(q.points);
    }

    await this.db.transaction(async (tx) => {
      for (const a of input.answers) {
        const q = questionMap.get(a.questionId);
        if (!q) continue;

        // Las preguntas abiertas no se autocalifican: quedan pendientes de
        // revisión docente (isCorrect = null marca "pendiente"). No suman
        // puntos hasta que el docente las califique (gradeOpenAnswer).
        if (q.questionType === 'open') {
          await tx.insert(schema.evaluationAnswers).values({
            attemptId: input.attemptId,
            questionId: a.questionId,
            answer: a.answer,
            isCorrect: null,
            pointsEarned: '0',
          });
          continue;
        }

        const correct = this.isAnswerCorrect(q, a.answer);
        const points = correct ? Number(q.points) : 0;
        totalScore += points;

        await tx.insert(schema.evaluationAnswers).values({
          attemptId: input.attemptId,
          questionId: a.questionId,
          answer: a.answer,
          isCorrect: correct,
          pointsEarned: String(points),
        });
      }
    });

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    const [evalRow] = await this.db
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.id, attempt.evaluationId))
      .limit(1);

    const isPassed = percentage >= Number(evalRow?.passingScore ?? 60);

    const [updated] = await this.db
      .update(schema.evaluationAttempts)
      .set({
        score: String(totalScore),
        maxScore: String(maxScore),
        percentage: String(percentage),
        isPassed,
        submittedAt: new Date(),
      })
      .where(eq(schema.evaluationAttempts.id, input.attemptId))
      .returning();

    return updated!;
  }

  /** Intentos de un estudiante para una evaluación (orden cronológico). */
  async listAttemptsByStudentEvaluation(evaluationId: string, studentId: string) {
    return this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(
        and(
          eq(schema.evaluationAttempts.evaluationId, evaluationId),
          eq(schema.evaluationAttempts.studentId, studentId),
        ),
      )
      .orderBy(asc(schema.evaluationAttempts.attemptNumber));
  }

  /** Respuestas abiertas pendientes de revisión en un curso (isCorrect = null). */
  async listPendingOpenAnswers(courseId: string) {
    return this.db
      .select({
        answerId: schema.evaluationAnswers.id,
        attemptId: schema.evaluationAttempts.id,
        evaluationId: schema.evaluations.id,
        evaluationTitle: schema.evaluations.title,
        questionId: schema.evaluationQuestions.id,
        questionText: schema.evaluationQuestions.questionText,
        maxPoints: schema.evaluationQuestions.points,
        answer: schema.evaluationAnswers.answer,
        studentId: schema.evaluationAttempts.studentId,
        studentFirstName: schema.users.firstName,
        studentLastName: schema.users.lastName,
        enrollmentId: schema.evaluationAttempts.enrollmentId,
        courseId: schema.evaluations.courseId,
        submittedAt: schema.evaluationAttempts.submittedAt,
      })
      .from(schema.evaluationAnswers)
      .innerJoin(
        schema.evaluationQuestions,
        eq(schema.evaluationAnswers.questionId, schema.evaluationQuestions.id),
      )
      .innerJoin(
        schema.evaluationAttempts,
        eq(schema.evaluationAnswers.attemptId, schema.evaluationAttempts.id),
      )
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluationAttempts.evaluationId, schema.evaluations.id),
      )
      .innerJoin(schema.users, eq(schema.evaluationAttempts.studentId, schema.users.id))
      .where(
        and(
          eq(schema.evaluations.courseId, courseId),
          eq(schema.evaluationQuestions.questionType, 'open'),
          isNull(schema.evaluationAnswers.isCorrect),
        ),
      )
      .orderBy(asc(schema.evaluationAttempts.submittedAt));
  }

  /** courseId de la evaluación a la que pertenece una respuesta (para ownership). */
  async getAnswerEvaluationCourse(answerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: schema.evaluations.courseId })
      .from(schema.evaluationAnswers)
      .innerJoin(
        schema.evaluationAttempts,
        eq(schema.evaluationAnswers.attemptId, schema.evaluationAttempts.id),
      )
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluationAttempts.evaluationId, schema.evaluations.id),
      )
      .where(eq(schema.evaluationAnswers.id, answerId))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** Respuesta por id (para propagar la calificación al motor de competencias). */
  async getAnswerById(answerId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluationAnswers)
      .where(eq(schema.evaluationAnswers.id, answerId))
      .limit(1);
    return row ?? null;
  }

  /** Califica una respuesta abierta y recalcula el score del intento. */
  async gradeOpenAnswer(answerId: string, points: number) {
    const [ans] = await this.db
      .select()
      .from(schema.evaluationAnswers)
      .where(eq(schema.evaluationAnswers.id, answerId))
      .limit(1);
    if (!ans) throw new Error('Respuesta no encontrada');

    const [q] = await this.db
      .select()
      .from(schema.evaluationQuestions)
      .where(eq(schema.evaluationQuestions.id, ans.questionId))
      .limit(1);
    const max = Number(q?.points ?? 0);
    const clamped = Math.max(0, Math.min(points, max));

    await this.db
      .update(schema.evaluationAnswers)
      .set({ pointsEarned: String(clamped), isCorrect: max > 0 ? clamped >= max : clamped > 0 })
      .where(eq(schema.evaluationAnswers.id, answerId));

    return this.recomputeAttempt(ans.attemptId);
  }

  /** Recalcula score/percentage/isPassed de un intento desde sus respuestas. */
  async recomputeAttempt(attemptId: string) {
    const answers = await this.db
      .select()
      .from(schema.evaluationAnswers)
      .where(eq(schema.evaluationAnswers.attemptId, attemptId));
    const totalScore = answers.reduce((sum, a) => sum + Number(a.pointsEarned), 0);

    const [attempt] = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(eq(schema.evaluationAttempts.id, attemptId))
      .limit(1);
    if (!attempt) throw new Error('Attempt not found');

    const maxScore = Number(attempt.maxScore ?? 0);
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    const [evalRow] = await this.db
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.id, attempt.evaluationId))
      .limit(1);
    const isPassed = percentage >= Number(evalRow?.passingScore ?? 60);

    const [updated] = await this.db
      .update(schema.evaluationAttempts)
      .set({ score: String(totalScore), percentage: String(percentage), isPassed })
      .where(eq(schema.evaluationAttempts.id, attemptId))
      .returning();
    return updated!;
  }

  // ---------- Leveled (escalera easy/medium/hard) ----------

  /** Intento por id (con `answers` + `status` del flujo leveled). */
  async getAttempt(attemptId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(eq(schema.evaluationAttempts.id, attemptId))
      .limit(1);
    return row ?? null;
  }

  /** Crea un intento leveled (status='in_progress', answers=[]). */
  async createLeveledAttempt(input: {
    evaluationId: string;
    studentId: string;
    enrollmentId: string;
    attemptNumber: number;
  }) {
    const [row] = await this.db
      .insert(schema.evaluationAttempts)
      .values({ ...input, answers: [], status: 'in_progress' })
      .returning();
    return row!;
  }

  /** Persiste el snapshot de respuestas de un intento leveled en curso. */
  async saveLeveledProgress(attemptId: string, answers: LeveledAnswer[]) {
    await this.db
      .update(schema.evaluationAttempts)
      .set({ answers, updatedAt: new Date() })
      .where(eq(schema.evaluationAttempts.id, attemptId));
  }

  /** Cierra un intento leveled: fija score/percentage/isPassed y status='submitted'. */
  async closeLeveledAttempt(input: {
    attemptId: string;
    correct: number;
    total: number;
    percentage: number;
    isPassed: boolean;
    answers: LeveledAnswer[];
  }) {
    const [row] = await this.db
      .update(schema.evaluationAttempts)
      .set({
        answers: input.answers,
        score: String(input.correct),
        maxScore: String(input.total),
        percentage: String(input.percentage),
        isPassed: input.isPassed,
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.evaluationAttempts.id, input.attemptId))
      .returning();
    return row!;
  }

  /** Inserta la recomendación personalizada (source_ai siempre 'openai-compatible'). */
  async insertRecommendation(input: {
    userId: string;
    courseId: string;
    claseId?: string | null;
    recommendationType: 'refuerzo' | 'avance';
    reason: string;
    sourceAi?: string;
  }) {
    const [row] = await this.db
      .insert(schema.recommendationAi)
      .values({
        userId: input.userId,
        courseId: input.courseId,
        claseId: input.claseId ?? null,
        recommendationType: input.recommendationType,
        reason: input.reason,
        sourceAi: input.sourceAi ?? 'openai-compatible',
      })
      .returning();
    return row!;
  }

  /** Recomendaciones de un usuario (para su propia bandeja). */
  async listRecommendationsByUser(userId: string) {
    return this.db
      .select()
      .from(schema.recommendationAi)
      .where(eq(schema.recommendationAi.userId, userId))
      .orderBy(desc(schema.recommendationAi.createdAt));
  }

  /** Corrección de una respuesta (reutiliza la lógica canónica de autocalificación). */
  isCorrect(q: typeof schema.evaluationQuestions.$inferSelect, answer: string): boolean {
    return this.isAnswerCorrect(q, answer);
  }

  private isAnswerCorrect(
    q: typeof schema.evaluationQuestions.$inferSelect,
    answer: string,
  ): boolean {
    if (q.questionType === 'multiple_choice' && q.options) {
      const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
      return correctIds.includes(answer);
    }
    if (q.correctAnswer) {
      return answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    }
    return false;
  }
}
