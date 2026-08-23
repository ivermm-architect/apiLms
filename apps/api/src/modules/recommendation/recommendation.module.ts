import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { GetLearningReportHandler } from './application/get-learning-report.query';
import { GetRecommendationsHandler } from './application/get-recommendations.query';
import { LEARNING_REPORT_NARRATOR } from './domain/ports/learning-report-narrator.port';
import { RECOMMENDER_EXPLAINER } from './domain/ports/recommender-explainer.port';
import { AiCacheService } from './infrastructure/ai-cache.service';
import { DrizzleLearningReportRepository } from './infrastructure/drizzle-learning-report.repository';
import { DrizzleRecommendationRepository } from './infrastructure/drizzle-recommendation.repository';
import { LlmLearningReportAdapter } from './infrastructure/llm-learning-report.adapter';
import { LlmRecommenderAdapter } from './infrastructure/llm-recommender.adapter';
import { RecommendationResolver } from './presentation/recommendation.resolver';

/**
 * HIST-7 — Recomendación de contenido. El núcleo (`rankRecommendations`) es
 * determinista; la IA (`LlmRecommenderAdapter`) es una capa opcional por
 * composición que solo reescribe justificaciones y degrada a `null` sin romper.
 *
 * Informe de aprendizaje IA (tesis §2.9). La IA REDACTA en lenguaje natural a
 * partir de hechos reales (avance + promedios); si está apagada o falla, el
 * informe devuelve `generated=false` y la UI lo oculta (degradación elegante).
 */
@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    // Caché en memoria compartido por ambos handlers de IA (singleton Nest):
    // sirve al instante y regenera en segundo plano (no bloquea la petición).
    AiCacheService,
    DrizzleRecommendationRepository,
    GetRecommendationsHandler,
    RecommendationResolver,
    { provide: RECOMMENDER_EXPLAINER, useClass: LlmRecommenderAdapter },
    DrizzleLearningReportRepository,
    GetLearningReportHandler,
    { provide: LEARNING_REPORT_NARRATOR, useClass: LlmLearningReportAdapter },
  ],
})
export class RecommendationModule {}
