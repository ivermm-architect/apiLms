import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { GetRecommendationsHandler } from './application/get-recommendations.query';
import { RECOMMENDER_EXPLAINER } from './domain/ports/recommender-explainer.port';
import { DrizzleRecommendationRepository } from './infrastructure/drizzle-recommendation.repository';
import { LlmRecommenderAdapter } from './infrastructure/llm-recommender.adapter';
import { RecommendationResolver } from './presentation/recommendation.resolver';

/**
 * HIST-7 — Recomendación de contenido. El núcleo (`rankRecommendations`) es
 * determinista; la IA (`LlmRecommenderAdapter`) es una capa opcional por
 * composición que solo reescribe justificaciones y degrada a `null` sin romper.
 */
@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    DrizzleRecommendationRepository,
    GetRecommendationsHandler,
    RecommendationResolver,
    { provide: RECOMMENDER_EXPLAINER, useClass: LlmRecommenderAdapter },
  ],
})
export class RecommendationModule {}
