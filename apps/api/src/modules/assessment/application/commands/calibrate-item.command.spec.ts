import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemPriorPort } from '../../domain/ports/item-prior.port';

import { CalibrateItemCommand, CalibrateItemHandler } from './calibrate-item.command';

// 12 respuestas (≥ minSample=10) con varianza → calibración empírica válida.
const SUFFICIENT_RESPONSES = Array.from({ length: 12 }, (_, i) => ({
  correct: i % 2 === 0,
  totalScore: i,
}));

const buildHandler = (overrides?: {
  responses?: Array<{ correct: boolean; totalScore: number }>;
  priors?: { a: number; b: number; confidence: number } | null;
  statement?: { statement: string; options?: string[]; competency?: string } | null;
}) => {
  const repo = {
    getItemResponses: vi.fn().mockResolvedValue(overrides?.responses ?? []),
    getItemStatement: vi
      .fn()
      .mockResolvedValue(
        overrides?.statement ?? { statement: '¿Cuánto es 2+2?', competency: 'Aritmética' },
      ),
    upsertIrtParams: vi.fn().mockResolvedValue(undefined),
  };
  const itemPrior: ItemPriorPort = {
    estimatePriors: vi.fn().mockResolvedValue(overrides?.priors ?? null),
  };
  const handler = new CalibrateItemHandler(repo as never, itemPrior);
  return { handler, repo, itemPrior };
};

describe('CalibrateItemHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cold-start (n<10) + IA con priors → persiste source:ai_prior y sampleSize 0', async () => {
    const { handler, repo, itemPrior } = buildHandler({
      responses: [{ correct: true, totalScore: 5 }], // < 10
      priors: { a: 1.4, b: -0.5, confidence: 0.7 },
    });

    const result = await handler.execute(new CalibrateItemCommand('q1'));

    expect(itemPrior.estimatePriors).toHaveBeenCalledOnce();
    expect(repo.upsertIrtParams).toHaveBeenCalledWith({
      questionId: 'q1',
      a: 1.4,
      b: -0.5,
      sampleSize: 0,
      source: 'ai_prior',
    });
    expect(result).toMatchObject({ calibrated: true, source: 'ai_prior', a: 1.4, b: -0.5 });
  });

  it('IA apagada (puerto devuelve null) en cold-start → idéntico al actual, no calibrado', async () => {
    const { handler, repo } = buildHandler({
      responses: [{ correct: true, totalScore: 5 }], // < 10
      priors: null, // simula AI_CALIBRATION_ENABLED=false
    });

    const result = await handler.execute(new CalibrateItemCommand('q1'));

    // Se consulta el puerto, pero al devolver null NO se persiste nada.
    expect(repo.upsertIrtParams).not.toHaveBeenCalled();
    expect(result).toMatchObject({ calibrated: false, source: null, a: 0, b: 0, sampleSize: 1 });
  });

  it('datos suficientes (n≥10) → SIEMPRE empírico; el puerto de IA NO se invoca', async () => {
    const { handler, repo, itemPrior } = buildHandler({ responses: SUFFICIENT_RESPONSES });

    const result = await handler.execute(new CalibrateItemCommand('q1'));

    expect(itemPrior.estimatePriors).not.toHaveBeenCalled();
    expect(repo.upsertIrtParams).toHaveBeenCalledOnce();
    expect(repo.upsertIrtParams).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'q1', sampleSize: 12, source: 'empirical' }),
    );
    expect(result).toMatchObject({ calibrated: true, source: 'empirical', sampleSize: 12 });
  });
});
