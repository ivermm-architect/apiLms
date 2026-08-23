import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

type GradedAttempt = Awaited<ReturnType<DrizzleEvaluationRepository['gradeOpenAnswer']>>;

export class GradeOpenAnswerCommand implements ICommand {
  constructor(
    public readonly answerId: string,
    public readonly points: number,
    public readonly feedback?: string | null,
  ) {}
}

@CommandHandler(GradeOpenAnswerCommand)
export class GradeOpenAnswerHandler implements ICommandHandler<
  GradeOpenAnswerCommand,
  GradedAttempt
> {
  constructor(private readonly evaluations: DrizzleEvaluationRepository) {}

  async execute(cmd: GradeOpenAnswerCommand): Promise<GradedAttempt> {
    // Califica la respuesta abierta (con retroalimentación opcional) y recalcula
    // el score del intento.
    return this.evaluations.gradeOpenAnswer(cmd.answerId, cmd.points, cmd.feedback);
  }
}
