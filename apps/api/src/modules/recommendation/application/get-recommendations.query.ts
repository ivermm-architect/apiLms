import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  RECOMMENDER_EXPLAINER,
  RecommenderExplainerPort,
} from '../domain/ports/recommender-explainer.port';
import { rankRecommendations, RankedRecommendation } from '../domain/recommendation';
import { AiCacheService, stableHash } from '../infrastructure/ai-cache.service';
import { DrizzleRecommendationRepository } from '../infrastructure/drizzle-recommendation.repository';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

export class GetRecommendationsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number = DEFAULT_LIMIT,
  ) {}
}

/**
 * Orquesta la recomendación de contenido (HIST-7):
 *  1) Trae competencias débiles del estudiante y cursos candidatos.
 *  2) Ordena de forma DETERMINISTA (núcleo verificable).
 *  3) OPCIONALMENTE reescribe las justificaciones con IA (composición). Si la IA
 *     está apagada o falla, se conserva la justificación determinista.
 */
@QueryHandler(GetRecommendationsQuery)
export class GetRecommendationsHandler implements IQueryHandler<
  GetRecommendationsQuery,
  RankedRecommendation[]
> {
  constructor(
    private readonly repo: DrizzleRecommendationRepository,
    @Inject(RECOMMENDER_EXPLAINER) private readonly explainer: RecommenderExplainerPort,
    private readonly cache: AiCacheService,
  ) {}

  async execute(query: GetRecommendationsQuery): Promise<RankedRecommendation[]> {
    const limit = Math.min(Math.max(1, query.limit || DEFAULT_LIMIT), MAX_LIMIT);

    const [weak, enrolledIds] = await Promise.all([
      this.repo.getWeakCompetencies(query.userId),
      this.repo.getEnrolledCourseIds(query.userId),
    ]);
    const candidates = await this.repo.getCandidateCourses(enrolledIds);

    // Núcleo determinista: SIEMPRE es la fuente de verdad del qué y el orden.
    const ranked = rankRecommendations(weak, candidates, limit);
    if (ranked.length === 0) return ranked;

    // Capa IA opcional (solo reescribe las justificaciones). NO se espera al
    // modelo en la petición: se sirve la versión determinista al instante y la
    // IA pule el texto en segundo plano; en la siguiente carga aparece pulido.
    const hash = stableHash(ranked.map((r) => r.courseId).join(','));
    const { value } = this.cache.getOrRefresh<RankedRecommendation[]>(
      `recommendations:${query.userId}`,
      hash,
      async () => {
        const overrides = await this.explainer.explain(
          ranked.map((r) => ({
            courseId: r.courseId,
            title: r.title,
            matchedCompetencies: r.matchedCompetencies,
            baseReason: r.reason,
          })),
        );
        if (!overrides) return null;
        return ranked.map((r) => {
          const aiReason = overrides.get(r.courseId);
          return aiReason ? { ...r, reason: aiReason } : r;
        });
      },
    );

    // Con texto IA cacheado, o determinista si aún no está listo.
    return value ?? ranked;
  }
}
