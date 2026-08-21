import { JwtPayload } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { GetRecommendationsQuery } from '../application/get-recommendations.query';
import { RankedRecommendation } from '../domain/recommendation';

import { RecommendedCourseType } from './dto/recommendation.types';

@UseGuards(JwtAuthGuard)
@Resolver()
export class RecommendationResolver {
  constructor(private readonly queryBus: QueryBus) {}

  /** Recomendaciones de cursos para el estudiante autenticado. */
  @Query(() => [RecommendedCourseType])
  async myRecommendations(
    @CurrentUser() user: JwtPayload,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<RecommendedCourseType[]> {
    const result = await this.queryBus.execute<GetRecommendationsQuery, RankedRecommendation[]>(
      new GetRecommendationsQuery(user.sub, limit ?? 6),
    );
    return result;
  }
}
