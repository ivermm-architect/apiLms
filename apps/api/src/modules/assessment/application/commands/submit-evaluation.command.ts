import { EvaluationAttempt } from '@cieba/db';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

export class SubmitEvaluationCommand implements ICommand {
  constructor(
    public readonly attemptId: string,
    public readonly answers: Array<{ questionId: string; answer: string }>,
  ) {}
}

@CommandHandler(SubmitEvaluationCommand)
export class SubmitEvaluationHandler implements ICommandHandler<
  SubmitEvaluationCommand,
  EvaluationAttempt
> {
  constructor(private readonly repo: DrizzleEvaluationRepository) {}

  async execute(cmd: SubmitEvaluationCommand): Promise<EvaluationAttempt> {
    return this.repo.submitAttempt({
      attemptId: cmd.attemptId,
      answers: cmd.answers,
    });
  }
}
