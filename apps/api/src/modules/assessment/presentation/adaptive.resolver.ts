import { JwtPayload } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { RunDiagnosticCommand } from '../application/commands/run-diagnostic.command';
import { StartAdaptiveExamCommand } from '../application/commands/start-adaptive-exam.command';
import { SubmitAdaptiveAnswerCommand } from '../application/commands/submit-adaptive-answer.command';
import { DrizzleAdaptiveRepository } from '../infrastructure/drizzle-adaptive.repository';

import { AdaptiveReportType, AdaptiveStepType } from './dto/adaptive.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class AdaptiveResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly repo: DrizzleAdaptiveRepository,
  ) {}

  // ---------- Estudiante: rendir CAT ----------

  @Mutation(() => AdaptiveStepType)
  startAdaptiveExam(
    @Args('evaluationId') evaluationId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(
      new StartAdaptiveExamCommand(evaluationId, user.sub, enrollmentId),
    );
  }

  @Mutation(() => AdaptiveStepType)
  submitAdaptiveAnswer(
    @Args('attemptId') attemptId: string,
    @Args('questionId') questionId: string,
    @Args('answer') answer: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(
      new SubmitAdaptiveAnswerCommand(attemptId, user.sub, questionId, answer),
    );
  }

  @Mutation(() => AdaptiveStepType)
  startDiagnostic(
    @Args('courseId') courseId: string,
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveStepType> {
    return this.commandBus.execute(new RunDiagnosticCommand(courseId, user.sub, enrollmentId));
  }

  // ---------- Estudiante: informe adaptativo ----------

  @Query(() => AdaptiveReportType)
  async myAdaptiveReport(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdaptiveReportType> {
    return this.buildReport(user.sub, courseId);
  }

  private async buildReport(userId: string, courseId: string): Promise<AdaptiveReportType> {
    const [rows, global, itemDifficulties] = await Promise.all([
      this.repo.getReportRows(userId, courseId),
      this.repo.getGlobalAbility(userId),
      this.repo.getCourseItemDifficulties(courseId),
    ]);
    return {
      userId,
      courseId,
      globalTheta: global ? Number(global.theta) : null,
      globalSe: global ? Number(global.se) : null,
      itemDifficulties,
      competencies: rows.map((r) => ({
        competencyId: r.competencyId,
        code: r.code,
        name: r.name,
        mastery: r.mastery != null ? Number(r.mastery) : 0,
        status: r.status ?? 'no_iniciada',
        theta: r.theta != null ? Number(r.theta) : null,
        se: r.se != null ? Number(r.se) : null,
      })),
    };
  }
}
