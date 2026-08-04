import { EvaluationAttempt } from '@cieba/db';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

export class StartEvaluationCommand implements ICommand {
  constructor(
    public readonly evaluationId: string,
    public readonly studentId: string,
    public readonly enrollmentId: string,
  ) {}
}

@CommandHandler(StartEvaluationCommand)
export class StartEvaluationHandler implements ICommandHandler<
  StartEvaluationCommand,
  EvaluationAttempt
> {
  constructor(private readonly repo: DrizzleEvaluationRepository) {}

  async execute(cmd: StartEvaluationCommand): Promise<EvaluationAttempt> {
    const evaluation = await this.repo.findById(cmd.evaluationId);
    if (!evaluation) throw new ConflictDomainException('Evaluación no existe');

    // Solo los intentos ENVIADOS cuentan para el límite (los abandonados no).
    const submitted = await this.repo.countSubmittedAttempts(cmd.evaluationId, cmd.studentId);
    if (submitted >= evaluation.maxAttempts) {
      throw new ConflictDomainException(
        `Has agotado los ${evaluation.maxAttempts} intentos permitidos`,
      );
    }

    // Reutiliza un intento abierto sin enviar en vez de crear otro (evita malgastar intentos).
    const open = await this.repo.findOpenAttempt(cmd.evaluationId, cmd.studentId);
    if (open) return open;

    return this.repo.createAttempt({
      evaluationId: cmd.evaluationId,
      studentId: cmd.studentId,
      enrollmentId: cmd.enrollmentId,
      attemptNumber: submitted + 1,
    });
  }
}
