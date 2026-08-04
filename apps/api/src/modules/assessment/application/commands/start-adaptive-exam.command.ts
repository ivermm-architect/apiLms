import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';
import { AdaptiveService, AdaptiveStep } from '../adaptive.service';

export class StartAdaptiveExamCommand implements ICommand {
  constructor(
    public readonly evaluationId: string,
    public readonly studentId: string,
    public readonly enrollmentId: string,
  ) {}
}

@CommandHandler(StartAdaptiveExamCommand)
export class StartAdaptiveExamHandler
  implements ICommandHandler<StartAdaptiveExamCommand, AdaptiveStep>
{
  constructor(
    private readonly evaluations: DrizzleEvaluationRepository,
    private readonly adaptive: AdaptiveService,
  ) {}

  async execute(cmd: StartAdaptiveExamCommand): Promise<AdaptiveStep> {
    const evaluation = await this.evaluations.findById(cmd.evaluationId);
    if (!evaluation) throw new ConflictDomainException('Evaluación no existe');
    if (evaluation.difficulty !== 'adaptive') {
      throw new ConflictDomainException('La evaluación no es adaptativa');
    }

    const submitted = await this.evaluations.countSubmittedAttempts(cmd.evaluationId, cmd.studentId);
    if (submitted >= evaluation.maxAttempts) {
      throw new ConflictDomainException(
        `Has agotado los ${evaluation.maxAttempts} intentos permitidos`,
      );
    }

    // Reutiliza un intento abierto en vez de gastar otro.
    const open = await this.evaluations.findOpenAttempt(cmd.evaluationId, cmd.studentId);
    const attempt =
      open ??
      (await this.evaluations.createAttempt({
        evaluationId: cmd.evaluationId,
        studentId: cmd.studentId,
        enrollmentId: cmd.enrollmentId,
        attemptNumber: submitted + 1,
      }));

    return this.adaptive.buildStep(attempt.id);
  }
}
