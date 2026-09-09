import { JwtPayload } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import {
  GetLearningReportQuery,
  LearningReportResult,
} from '../application/get-learning-report.query';
import { GetRecommendationsQuery } from '../application/get-recommendations.query';
import { RankedRecommendation } from '../domain/recommendation';
import { AiCacheService } from '../infrastructure/ai-cache.service';

import { LearningReportType } from './dto/learning-report.types';
import { RecommendedCourseType } from './dto/recommendation.types';

@UseGuards(JwtAuthGuard)
@Resolver()
export class RecommendationResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly aiCache: AiCacheService,
  ) {}

  /** Recomendaciones de cursos para el estudiante autenticado. */
  @Query(() => [RecommendedCourseType])
  async myRecommendations(
    @CurrentUser() user: JwtPayload,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<RecommendedCourseType[]> {
    const result = await this.queryBus.execute<GetRecommendationsQuery, RankedRecommendation[]>(
      new GetRecommendationsQuery(user.sub, limit ?? 6),
    );
    // `aiPending` es opcional en el dominio (lo fija la capa de aplicación);
    // aquí se normaliza para cumplir el contrato no-nulo del esquema GraphQL.
    return result.map((r) => ({ ...r, aiPending: r.aiPending ?? false }));
  }

  /**
   * Informe de aprendizaje del estudiante redactado por IA (tesis §2.9). Si la
   * IA está deshabilitada, falla o no hay datos, devuelve `generated=false` y la
   * UI oculta el informe (degradación elegante).
   */
  @Query(() => LearningReportType)
  async myLearningReport(@CurrentUser() user: JwtPayload): Promise<LearningReportResult> {
    return this.queryBus.execute<GetLearningReportQuery, LearningReportResult>(
      new GetLearningReportQuery(user.sub),
    );
  }

  /**
   * Fuerza una nueva redacción del informe por la IA. Invalida el snapshot
   * cacheado del estudiante (aunque sus hechos no hayan cambiado) y vuelve a
   * ejecutar la consulta, que dispara `narrate()` en segundo plano. Devuelve el
   * estado inmediato (`pending=true`); la UI muestra el loader y se refresca.
   */
  @Mutation(() => LearningReportType)
  async regenerateLearningReport(@CurrentUser() user: JwtPayload): Promise<LearningReportResult> {
    this.aiCache.invalidate(`learning-report:${user.sub}`);
    return this.queryBus.execute<GetLearningReportQuery, LearningReportResult>(
      new GetLearningReportQuery(user.sub),
    );
  }
}
