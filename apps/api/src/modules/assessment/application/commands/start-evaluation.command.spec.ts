import { EvaluationAttempt } from '@cieba/db';
import { describe, expect, it, vi } from 'vitest';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

import { StartEvaluationCommand, StartEvaluationHandler } from './start-evaluation.command';

const CMD = new StartEvaluationCommand('ev-1', 'student-1', 'enr-1');

function buildHandler(opts: {
  evaluation?: { maxAttempts: number } | null;
  submitted?: number;
  open?: Partial<EvaluationAttempt> | null;
  created?: Partial<EvaluationAttempt>;
}) {
  const repo = {
    findById: vi.fn().mockResolvedValue(opts.evaluation ?? null),
    countSubmittedAttempts: vi.fn().mockResolvedValue(opts.submitted ?? 0),
    findOpenAttempt: vi.fn().mockResolvedValue(opts.open ?? null),
    createAttempt: vi.fn().mockResolvedValue(opts.created ?? { id: 'att-new' }),
  } as unknown as DrizzleEvaluationRepository;

  return { handler: new StartEvaluationHandler(repo), repo };
}

describe('StartEvaluationHandler', () => {
  it('lanza conflicto si la evaluación no existe', async () => {
    const { handler } = buildHandler({ evaluation: null });
    await expect(handler.execute(CMD)).rejects.toBeInstanceOf(ConflictDomainException);
  });

  it('lanza conflicto si se agotaron los intentos permitidos', async () => {
    const { handler, repo } = buildHandler({ evaluation: { maxAttempts: 2 }, submitted: 2 });
    await expect(handler.execute(CMD)).rejects.toThrow(/agotado los 2 intentos/);
    expect(repo.createAttempt).not.toHaveBeenCalled();
  });

  it('reutiliza un intento abierto sin crear uno nuevo', async () => {
    const open = { id: 'att-open' } as EvaluationAttempt;
    const { handler, repo } = buildHandler({
      evaluation: { maxAttempts: 3 },
      submitted: 1,
      open,
    });

    const result = await handler.execute(CMD);

    expect(result).toBe(open);
    expect(repo.createAttempt).not.toHaveBeenCalled();
  });

  it('crea un intento nuevo con attemptNumber = enviados + 1', async () => {
    const created = { id: 'att-new' } as EvaluationAttempt;
    const { handler, repo } = buildHandler({
      evaluation: { maxAttempts: 3 },
      submitted: 1,
      open: null,
      created,
    });

    const result = await handler.execute(CMD);

    expect(result).toBe(created);
    expect(repo.createAttempt).toHaveBeenCalledWith({
      evaluationId: 'ev-1',
      studentId: 'student-1',
      enrollmentId: 'enr-1',
      attemptNumber: 2,
    });
  });
});
