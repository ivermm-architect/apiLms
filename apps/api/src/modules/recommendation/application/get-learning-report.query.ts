import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  LEARNING_REPORT_NARRATOR,
  LearningReportNarratorPort,
} from '../domain/ports/learning-report-narrator.port';
import { AiCacheService, stableHash } from '../infrastructure/ai-cache.service';
import { DrizzleLearningReportRepository } from '../infrastructure/drizzle-learning-report.repository';

export class GetLearningReportQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

/** Payload cacheado del informe (sin la metadata generated/pending). */
interface CachedReport {
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

/**
 * Resultado del informe de aprendizaje. `generated=false` significa que la IA
 * está deshabilitada, falló o el estudiante no tiene datos: la UI oculta el
 * informe (degradación elegante, tesis §2.9 + punto 14). `pending=true` indica
 * que la redacción se está generando en segundo plano y aún no hay un informe:
 * la UI muestra "generando…" y se refresca sola.
 */
export interface LearningReportResult {
  generated: boolean;
  pending: boolean;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  /** ISO-8601 en que la IA redactó el informe; null si aún no hay. */
  generatedAt: string | null;
}

const EMPTY: LearningReportResult = {
  generated: false,
  pending: false,
  summary: null,
  strengths: [],
  weaknesses: [],
  recommendations: [],
  generatedAt: null,
};

/**
 * Orquesta el informe de aprendizaje (tesis §2.9):
 *  1) Reúne los HECHOS reales del estudiante (avance + promedios), sin psicometría.
 *  2) La IA los REDACTA en lenguaje natural (fortalezas, debilidades, recomendaciones).
 *  3) Si la IA está apagada, falla o no hay datos, devuelve `generated=false`.
 */
@QueryHandler(GetLearningReportQuery)
export class GetLearningReportHandler implements IQueryHandler<
  GetLearningReportQuery,
  LearningReportResult
> {
  constructor(
    private readonly repo: DrizzleLearningReportRepository,
    @Inject(LEARNING_REPORT_NARRATOR) private readonly narrator: LearningReportNarratorPort,
    private readonly cache: AiCacheService,
  ) {}

  async execute(query: GetLearningReportQuery): Promise<LearningReportResult> {
    const courses = await this.repo.getStudentCourseFacts(query.userId);
    if (courses.length === 0) return EMPTY;

    // Snapshot de los hechos: si cambian (avance/notas), el caché se invalida y
    // se regenera en segundo plano. Si no cambian, se sirve al instante.
    const hash = stableHash(
      JSON.stringify(
        courses.map((c) => [
          c.title,
          c.progress,
          c.lessonsCompleted,
          c.totalLessons,
          c.averageScore,
          c.gradeCount,
        ]),
      ),
    );

    // NO se espera al modelo aquí: el caché responde ya y regenera aparte.
    const { value, pending, updatedAt } = this.cache.getOrRefresh<CachedReport>(
      `learning-report:${query.userId}`,
      hash,
      async () => {
        const narration = await this.narrator.narrate({ courses });
        if (!narration) return null;
        return {
          summary: narration.summary || null,
          strengths: narration.strengths,
          weaknesses: narration.weaknesses,
          recommendations: narration.recommendations,
        };
      },
    );

    if (value) {
      return {
        generated: true,
        pending,
        ...value,
        generatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      };
    }
    // Sin informe todavía: pending=true → la UI muestra "generando…" y refresca.
    return { ...EMPTY, pending };
  }
}
