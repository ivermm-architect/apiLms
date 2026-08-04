import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { DrizzleAdaptiveRepository } from '../../infrastructure/drizzle-adaptive.repository';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';
import { AdaptiveService, AdaptiveStep } from '../adaptive.service';

// Prueba diagnóstica: arranca el CAT sobre la evaluación adaptativa del curso.
// Sirve como línea base de habilidad antes de estudiar (RF diagnóstica).
export class RunDiagnosticCommand implements ICommand {
  constructor(
    public readonly courseId: string,
    public readonly studentId: string,
    public readonly enrollmentId: string,
  ) {}
}

@CommandHandler(RunDiagnosticCommand)
export class RunDiagnosticHandler implements ICommandHandler<RunDiagnosticCommand, AdaptiveStep> {
  constructor(
    private readonly adaptiveRepo: DrizzleAdaptiveRepository,
    private readonly evaluations: DrizzleEvaluationRepository,
    private readonly adaptive: AdaptiveService,
  ) {}

  async execute(cmd: RunDiagnosticCommand): Promise<AdaptiveStep> {
    const evaluation = await this.adaptiveRepo.findAdaptiveEvaluation(cmd.courseId);
    if (!evaluation) {
      throw new ConflictDomainException('El curso no tiene una evaluación adaptativa/diagnóstica');
    }

    const open = await this.evaluations.findOpenAttempt(evaluation.id, cmd.studentId);
    const submitted = await this.evaluations.countSubmittedAttempts(evaluation.id, cmd.studentId);
    const attempt =
      open ??
      (await this.evaluations.createAttempt({
        evaluationId: evaluation.id,
        studentId: cmd.studentId,
        enrollmentId: cmd.enrollmentId,
        attemptNumber: submitted + 1,
      }));

    return this.adaptive.buildStep(attempt.id);
  }
}
