import { Injectable } from '@nestjs/common';

import {
  estimateTheta,
  masteryStatus,
  scoreAnswer,
  selectNextItem,
  shouldStop,
  thetaToMastery,
  updateBKT,
  CatItem,
  CatResponse,
} from '../domain/adaptive';
import { DrizzleAdaptiveRepository } from '../infrastructure/drizzle-adaptive.repository';

// Configuración del CAT (determinista). Ajustable si se mueve a system_config.
const MIN_ITEMS = 5;
const MAX_ITEMS = 15;
const SE_THRESHOLD = 0.3;

// Parámetros BKT por defecto cuando la competencia aún no tiene estado.
const BKT_DEFAULTS = { pInit: 0.1, pTransit: 0.2, pSlip: 0.1, pGuess: 0.2 };

const logit = (p: number): number => {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  return Math.log(clamped / (1 - clamped));
};

export interface AdaptiveStep {
  attemptId: string;
  theta: number;
  se: number;
  itemsAdministered: number;
  finished: boolean;
  nextItem: {
    id: string;
    questionText: string;
    questionType: string;
    options: Array<{ id: string; text: string }> | null;
  } | null;
}

@Injectable()
export class AdaptiveService {
  constructor(private readonly repo: DrizzleAdaptiveRepository) {}

  /**
   * Registra una respuesta: la corrige, actualiza θ global, y actualiza el
   * estado BKT + progreso + θ por competencia (compute-competency-progress).
   */
  async recordAnswer(attemptId: string, userId: string, questionId: string, answer: string): Promise<void> {
    const question = await this.repo.getQuestion(questionId);
    if (!question) throw new Error('Pregunta no encontrada');

    const correct = scoreAnswer(
      { questionType: question.questionType, options: question.options, correctAnswer: question.correctAnswer },
      answer,
    );
    await this.repo.recordAnswer({
      attemptId,
      questionId,
      answer,
      correct,
      points: Number(question.points),
    });

    // θ global (EAP sobre todos los ítems calibrados respondidos).
    const est = await this.estimate(attemptId);
    await this.repo.upsertAbilityEstimate({
      userId,
      competencyId: null,
      scope: 'global',
      theta: est.theta,
      se: est.se,
    });

    // BKT + progreso por cada competencia del ítem respondido.
    const competencyIds = await this.repo.getQuestionCompetencies(questionId);
    for (const competencyId of competencyIds) {
      const state = await this.repo.getBktState(userId, competencyId);
      const params = {
        pTransit: state ? Number(state.pTransit) : BKT_DEFAULTS.pTransit,
        pSlip: state ? Number(state.pSlip) : BKT_DEFAULTS.pSlip,
        pGuess: state ? Number(state.pGuess) : BKT_DEFAULTS.pGuess,
      };
      const pKnow0 = state ? Number(state.pKnow) : BKT_DEFAULTS.pInit;
      const pKnow = updateBKT(pKnow0, correct, params);

      await this.repo.upsertBktState({ userId, competencyId, pKnow, ...params });
      await this.repo.upsertCompetencyProgress({
        userId,
        competencyId,
        mastery: pKnow,
        status: masteryStatus(pKnow),
      });
      // θ por competencia derivado del dominio BKT (para el informe).
      await this.repo.upsertAbilityEstimate({
        userId,
        competencyId,
        scope: 'competency',
        theta: logit(pKnow),
        se: est.se,
      });
    }
  }

  /** Estimación EAP de θ con los ítems calibrados ya respondidos en el intento. */
  private async estimate(attemptId: string): Promise<{ theta: number; se: number }> {
    const answered = await this.repo.getAnsweredItems(attemptId);
    const responses: CatResponse[] = answered.map((a) => ({
      item: { id: a.id, a: a.a, b: a.b, c: a.c },
      correct: a.correct,
    }));
    return estimateTheta(responses);
  }

  /**
   * Construye el siguiente paso: θ actual, ítem por máxima información y parada.
   * Si finaliza, cierra el intento con el dominio (θ→mastery) como porcentaje.
   */
  async buildStep(attemptId: string): Promise<AdaptiveStep> {
    const attempt = await this.repo.getAttempt(attemptId);
    if (!attempt) throw new Error('Intento no encontrado');

    const est = await this.estimate(attemptId);
    const answeredIds = new Set(await this.repo.getAnsweredQuestionIds(attemptId));
    const fullPool = await this.repo.getCalibratedPool(attempt.evaluationId);
    const pool: CatItem[] = fullPool
      .filter((i) => !answeredIds.has(i.id))
      .map((i) => ({ id: i.id, a: i.a, b: i.b, c: i.c }));

    const administered = answeredIds.size;
    const maxItems = Math.min(MAX_ITEMS, administered + pool.length);
    const stop =
      pool.length === 0 ||
      shouldStop(administered, est.se, { minItems: MIN_ITEMS, maxItems, seThreshold: SE_THRESHOLD });

    const chosen = stop ? null : selectNextItem(pool, est.theta);
    const finished = stop || chosen === null;

    if (finished) {
      const evaluation = await this.repo.getEvaluation(attempt.evaluationId);
      await this.repo.finishAttempt({
        attemptId,
        mastery: thetaToMastery(est.theta),
        passingScore: Number(evaluation?.passingScore ?? 60),
        itemsAdministered: administered,
      });
    }

    let nextItem: AdaptiveStep['nextItem'] = null;
    if (chosen) {
      const q = await this.repo.getQuestion(chosen.id);
      if (q) {
        nextItem = {
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          // Se ocultan las respuestas correctas al estudiante.
          options: q.options?.map((o) => ({ id: o.id, text: o.text })) ?? null,
        };
      }
    }

    return {
      attemptId,
      theta: est.theta,
      se: est.se,
      itemsAdministered: administered,
      finished,
      nextItem,
    };
  }
}
