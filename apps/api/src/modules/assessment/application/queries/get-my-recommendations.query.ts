import { RecommendationAi } from '@cieba/db';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

export class GetMyRecommendationsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetMyRecommendationsQuery)
export class GetMyRecommendationsHandler implements IQueryHandler<
  GetMyRecommendationsQuery,
  RecommendationAi[]
> {
  constructor(private readonly repo: DrizzleEvaluationRepository) {}

  execute(query: GetMyRecommendationsQuery): Promise<RecommendationAi[]> {
    return this.repo.listRecommendationsByUser(query.userId);
  }
}
