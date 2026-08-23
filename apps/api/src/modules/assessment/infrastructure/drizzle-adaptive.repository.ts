import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

export interface CalibratedItem {
  id: string;
  a: number;
  b: number;
  c: number;
  questionType: string;
  options: Array<{ id: string; text: string; isCorrect: boolean }> | null;
  correctAnswer: string | null;
  points: number;
}

export interface AnsweredItem extends CalibratedItem {
  correct: boolean;
}

@Injectable()
export class DrizzleAdaptiveRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ---------- Pool / ítems calibrados ----------

  /** Ítems de una evaluación que tienen parámetros TRI calibrados. */
  async getCalibratedPool(evaluationId: string): Promise<CalibratedItem[]> {
    const rows = await this.db
      .select({
        id: schema.evaluationQuestions.id,
        a: schema.itemIrtParams.a,
        b: schema.itemIrtParams.b,
        c: schema.itemIrtParams.c,
        questionType: schema.evaluationQuestions.questionType,
        options: schema.evaluationQuestions.options,
        correctAnswer: schema.evaluationQuestions.correctAnswer,
        points: schema.evaluationQuestions.points,
      })
      .from(schema.evaluationQuestions)
      .innerJoin(
        schema.itemIrtParams,
        eq(schema.itemIrtParams.questionId, schema.evaluationQuestions.id),
      )
      .where(eq(schema.evaluationQuestions.evaluationId, evaluationId));
    return rows.map((r) => ({
      ...r,
      a: Number(r.a),
      b: Number(r.b),
      c: Number(r.c),
      points: Number(r.points),
    }));
  }

  /** Ítems ya respondidos en un intento (con parámetros TRI y acierto). */
  async getAnsweredItems(attemptId: string): Promise<AnsweredItem[]> {
    const rows = await this.db
      .select({
        id: schema.evaluationQuestions.id,
        a: schema.itemIrtParams.a,
        b: schema.itemIrtParams.b,
        c: schema.itemIrtParams.c,
        questionType: schema.evaluationQuestions.questionType,
        options: schema.evaluationQuestions.options,
        correctAnswer: schema.evaluationQuestions.correctAnswer,
        points: schema.evaluationQuestions.points,
        correct: schema.evaluationAnswers.isCorrect,
      })
      .from(schema.evaluationAnswers)
      .innerJoin(
        schema.evaluationQuestions,
        eq(schema.evaluationAnswers.questionId, schema.evaluationQuestions.id),
      )
      .innerJoin(
        schema.itemIrtParams,
        eq(schema.itemIrtParams.questionId, schema.evaluationQuestions.id),
      )
      .where(eq(schema.evaluationAnswers.attemptId, attemptId));
    return rows.map((r) => ({
      ...r,
      a: Number(r.a),
      b: Number(r.b),
      c: Number(r.c),
      points: Number(r.points),
      correct: r.correct ?? false,
    }));
  }

  async getAnsweredQuestionIds(attemptId: string): Promise<string[]> {
    const rows = await this.db
      .select({ questionId: schema.evaluationAnswers.questionId })
      .from(schema.evaluationAnswers)
      .where(eq(schema.evaluationAnswers.attemptId, attemptId));
    return rows.map((r) => r.questionId);
  }

  async getAttempt(attemptId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluationAttempts)
      .where(eq(schema.evaluationAttempts.id, attemptId))
      .limit(1);
    return row ?? null;
  }

  /** Marca el intento adaptativo como enviado con el θ final normalizado a %. */
  async finishAttempt(input: {
    attemptId: string;
    mastery: number;
    passingScore: number;
    itemsAdministered: number;
  }): Promise<void> {
    const percentage = input.mastery * 100;
    await this.db
      .update(schema.evaluationAttempts)
      .set({
        score: String(input.itemsAdministered),
        maxScore: String(input.itemsAdministered),
        percentage: String(percentage),
        isPassed: percentage >= input.passingScore,
        submittedAt: new Date(),
      })
      .where(eq(schema.evaluationAttempts.id, input.attemptId));
  }

  async getEvaluation(evaluationId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.id, evaluationId))
      .limit(1);
    return row ?? null;
  }

  /** Primera evaluación adaptativa activa de un curso (para la diagnóstica). */
  async findAdaptiveEvaluation(courseId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluations)
      .where(
        and(
          eq(schema.evaluations.courseId, courseId),
          eq(schema.evaluations.difficulty, 'adaptive'),
          eq(schema.evaluations.isActive, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getQuestion(questionId: string) {
    const [row] = await this.db
      .select()
      .from(schema.evaluationQuestions)
      .where(eq(schema.evaluationQuestions.id, questionId))
      .limit(1);
    return row ?? null;
  }

  async recordAnswer(input: {
    attemptId: string;
    questionId: string;
    answer: string;
    correct: boolean;
    points: number;
  }): Promise<void> {
    await this.db.insert(schema.evaluationAnswers).values({
      attemptId: input.attemptId,
      questionId: input.questionId,
      answer: input.answer,
      isCorrect: input.correct,
      pointsEarned: String(input.correct ? input.points : 0),
    });
  }

  // ---------- Competencias del ítem ----------

  async getQuestionCompetencies(questionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ competencyId: schema.questionCompetencies.competencyId })
      .from(schema.questionCompetencies)
      .where(eq(schema.questionCompetencies.questionId, questionId));
    return rows.map((r) => r.competencyId);
  }

  // ---------- Estimaciones de habilidad θ ----------

  async upsertAbilityEstimate(input: {
    userId: string;
    competencyId: string | null;
    scope: string;
    theta: number;
    se: number;
  }): Promise<void> {
    await this.db
      .insert(schema.abilityEstimates)
      .values({
        userId: input.userId,
        competencyId: input.competencyId,
        scope: input.scope,
        theta: String(input.theta),
        se: String(input.se),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.abilityEstimates.userId,
          schema.abilityEstimates.competencyId,
          schema.abilityEstimates.scope,
        ],
        set: { theta: String(input.theta), se: String(input.se), updatedAt: new Date() },
      });
  }

  // ---------- Estado BKT ----------

  async getBktState(userId: string, competencyId: string) {
    const [row] = await this.db
      .select()
      .from(schema.bktStates)
      .where(
        and(eq(schema.bktStates.userId, userId), eq(schema.bktStates.competencyId, competencyId)),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertBktState(input: {
    userId: string;
    competencyId: string;
    pKnow: number;
    pTransit: number;
    pSlip: number;
    pGuess: number;
  }): Promise<void> {
    await this.db
      .insert(schema.bktStates)
      .values({
        userId: input.userId,
        competencyId: input.competencyId,
        pKnow: String(input.pKnow),
        pTransit: String(input.pTransit),
        pSlip: String(input.pSlip),
        pGuess: String(input.pGuess),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.bktStates.userId, schema.bktStates.competencyId],
        set: { pKnow: String(input.pKnow), updatedAt: new Date() },
      });
  }

  // ---------- Progreso por competencia ----------

  async upsertCompetencyProgress(input: {
    userId: string;
    competencyId: string;
    mastery: number;
    status: 'no_iniciada' | 'en_progreso' | 'en_riesgo' | 'dominada';
  }): Promise<void> {
    await this.db
      .insert(schema.competencyProgress)
      .values({
        userId: input.userId,
        competencyId: input.competencyId,
        mastery: String(input.mastery),
        status: input.status,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.competencyProgress.userId, schema.competencyProgress.competencyId],
        set: { mastery: String(input.mastery), status: input.status, updatedAt: new Date() },
      });
  }

  // ---------- Informe adaptativo (estudiante) ----------

  /** Dominio por competencia del estudiante en un curso. */
  async getReportRows(userId: string, courseId: string) {
    return this.db
      .select({
        competencyId: schema.competencies.id,
        code: schema.competencies.code,
        name: schema.competencies.name,
        mastery: schema.competencyProgress.mastery,
        status: schema.competencyProgress.status,
        theta: schema.abilityEstimates.theta,
        se: schema.abilityEstimates.se,
      })
      .from(schema.competencies)
      .leftJoin(
        schema.competencyProgress,
        and(
          eq(schema.competencyProgress.competencyId, schema.competencies.id),
          eq(schema.competencyProgress.userId, userId),
        ),
      )
      .leftJoin(
        schema.abilityEstimates,
        and(
          eq(schema.abilityEstimates.competencyId, schema.competencies.id),
          eq(schema.abilityEstimates.userId, userId),
          eq(schema.abilityEstimates.scope, 'competency'),
        ),
      )
      .where(eq(schema.competencies.courseId, courseId));
  }

  /** θ global del estudiante (scope 'global'). */
  async getGlobalAbility(userId: string) {
    const [row] = await this.db
      .select({ theta: schema.abilityEstimates.theta, se: schema.abilityEstimates.se })
      .from(schema.abilityEstimates)
      .where(
        and(
          eq(schema.abilityEstimates.userId, userId),
          eq(schema.abilityEstimates.scope, 'global'),
          isNull(schema.abilityEstimates.competencyId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Dificultades (b, TRI) de los ítems calibrados de un curso. Para el mapa persona-ítem. */
  async getCourseItemDifficulties(courseId: string): Promise<number[]> {
    const rows = await this.db
      .select({ b: schema.itemIrtParams.b })
      .from(schema.itemIrtParams)
      .innerJoin(
        schema.evaluationQuestions,
        eq(schema.evaluationQuestions.id, schema.itemIrtParams.questionId),
      )
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluations.id, schema.evaluationQuestions.evaluationId),
      )
      .where(eq(schema.evaluations.courseId, courseId));
    return rows.map((r) => Number(r.b));
  }

  // ---------- Calibración ----------

  /** Respuestas observadas de un ítem (acierto + puntaje total del intento). */
  async getItemResponses(questionId: string) {
    return this.db
      .select({
        correct: schema.evaluationAnswers.isCorrect,
        totalScore: schema.evaluationAttempts.score,
      })
      .from(schema.evaluationAnswers)
      .innerJoin(
        schema.evaluationAttempts,
        eq(schema.evaluationAnswers.attemptId, schema.evaluationAttempts.id),
      )
      .where(eq(schema.evaluationAnswers.questionId, questionId));
  }

  async upsertIrtParams(input: {
    questionId: string;
    a: number;
    b: number;
    sampleSize: number;
    /** Origen de los parámetros: 'empirical' (canónico) | 'ai_prior' (semilla IA). */
    source?: 'empirical' | 'ai_prior';
  }): Promise<void> {
    await this.db
      .insert(schema.itemIrtParams)
      .values({
        questionId: input.questionId,
        a: String(input.a),
        b: String(input.b),
        c: '0',
        sampleSize: String(input.sampleSize),
        source: input.source ?? null,
        calibratedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.itemIrtParams.questionId,
        set: {
          a: String(input.a),
          b: String(input.b),
          sampleSize: String(input.sampleSize),
          source: input.source ?? null,
          calibratedAt: new Date(),
        },
      });
  }

  /**
   * Texto y contexto del ítem para la semilla asistida por IA (cold-start).
   * Devuelve el enunciado, las opciones (si las hay) y la primera competencia
   * asociada como contexto. `null` si el ítem no existe.
   */
  async getItemStatement(questionId: string): Promise<{
    statement: string;
    options?: string[];
    competency?: string;
  } | null> {
    const [q] = await this.db
      .select({
        questionText: schema.evaluationQuestions.questionText,
        options: schema.evaluationQuestions.options,
      })
      .from(schema.evaluationQuestions)
      .where(eq(schema.evaluationQuestions.id, questionId))
      .limit(1);
    if (!q) return null;

    const [comp] = await this.db
      .select({ name: schema.competencies.name })
      .from(schema.questionCompetencies)
      .innerJoin(
        schema.competencies,
        eq(schema.competencies.id, schema.questionCompetencies.competencyId),
      )
      .where(eq(schema.questionCompetencies.questionId, questionId))
      .limit(1);

    const options = Array.isArray(q.options) ? q.options.map((o) => o.text) : undefined;
    return {
      statement: q.questionText,
      options: options && options.length > 0 ? options : undefined,
      competency: comp?.name,
    };
  }

  /** IDs de competencias de un curso (para diagnóstica). */
  async getCourseCompetencyIds(courseId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.competencies.id })
      .from(schema.competencies)
      .where(eq(schema.competencies.courseId, courseId));
    return rows.map((r) => r.id);
  }

  /** Verifica que un conjunto de competencias pertenezca a un curso. */
  async filterCompetenciesByCourse(courseId: string, competencyIds: string[]): Promise<string[]> {
    if (competencyIds.length === 0) return [];
    const rows = await this.db
      .select({ id: schema.competencies.id })
      .from(schema.competencies)
      .where(
        and(
          eq(schema.competencies.courseId, courseId),
          inArray(schema.competencies.id, competencyIds),
        ),
      );
    return rows.map((r) => r.id);
  }
}
