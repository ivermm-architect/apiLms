import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { DrizzleAdaptiveRepository } from '../../infrastructure/drizzle-adaptive.repository';
import { AdaptiveService, AdaptiveStep } from '../adaptive.service';

export class SubmitAdaptiveAnswerCommand implements ICommand {
  constructor(
    public readonly attemptId: string,
    public readonly studentId: string,
    public readonly questionId: string,
    public readonly answer: string,
  ) {}
}

@CommandHandler(SubmitAdaptiveAnswerCommand)
export class SubmitAdaptiveAnswerHandler
  implements ICommandHandler<SubmitAdaptiveAnswerCommand, AdaptiveStep>
{
  constructor(
    private readonly repo: DrizzleAdaptiveRepository,
    private readonly adaptive: AdaptiveService,
  ) {}

  async execute(cmd: SubmitAdaptiveAnswerCommand): Promise<AdaptiveStep> {
    const attempt = await this.repo.getAttempt(cmd.attemptId);
    if (!attempt) throw new ConflictDomainException('Intento no encontrado');
    if (attempt.studentId !== cmd.studentId) {
      throw new ConflictDomainException('El intento no pertenece al estudiante');
    }
    if (attempt.submittedAt) throw new ConflictDomainException('El intento ya fue enviado');

    // Evita responder dos veces el mismo ítem en el intento.
    const answered = new Set(await this.repo.getAnsweredQuestionIds(cmd.attemptId));
    if (answered.has(cmd.questionId)) {
      throw new ConflictDomainException('El ítem ya fue respondido');
    }

    await this.adaptive.recordAnswer(cmd.attemptId, cmd.studentId, cmd.questionId, cmd.answer);
    return this.adaptive.buildStep(cmd.attemptId);
  }
}
