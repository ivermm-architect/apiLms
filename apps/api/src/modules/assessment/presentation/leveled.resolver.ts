import { JwtPayload } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import {
  StartLeveledExamCommand,
  LeveledStep,
} from '../application/commands/start-leveled-exam.command';
import { SubmitLeveledAnswerCommand } from '../application/commands/submit-leveled-answer.command';
import { GetMyRecommendationsQuery } from '../application/queries/get-my-recommendations.query';

import { LeveledStepType, RecommendationAiType } from './dto/leveled.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class LeveledResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ---------- Estudiante: rendir el examen por niveles ----------

  @Mutation(() => LeveledStepType)
  startLeveledExam(
    @Args('evaluationId') evaluationId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<LeveledStep> {
    // studentId se fuerza al del token: un estudiante nunca inicia por otro user_id.
    return this.commandBus.execute(
      new StartLeveledExamCommand(evaluationId, user.sub, enrollmentId),
    );
  }

  @Mutation(() => LeveledStepType)
  submitLeveledAnswer(
    @Args('attemptId') attemptId: string,
    @Args('questionId') questionId: string,
    @Args('answer') answer: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<LeveledStep> {
    // requesterId (user.sub) → el command verifica la propiedad del intento.
    return this.commandBus.execute(
      new SubmitLeveledAnswerCommand(attemptId, questionId, answer, user.sub),
    );
  }

  // ---------- Estudiante: sus recomendaciones ----------

  @Query(() => [RecommendationAiType])
  myLeveledRecommendations(@CurrentUser() user: JwtPayload): Promise<RecommendationAiType[]> {
    return this.queryBus.execute(new GetMyRecommendationsQuery(user.sub)) as unknown as Promise<
      RecommendationAiType[]
    >;
  }
}
