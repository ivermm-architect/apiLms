import { describe, expect, it } from 'vitest';

import { auc, bias, pearson, rmse } from './metrics';
import { makeRng } from './rng';
import { bktStudy, calibrationStudy, catStudy } from './studies';

// Semilla fija => resultados deterministas y reproducibles.
const SEED = 12345;

describe('métricas', () => {
  it('bias y rmse son 0 cuando estimado = verdadero', () => {
    const x = [1, 2, 3];
    expect(bias(x, x)).toBe(0);
    expect(rmse(x, x)).toBe(0);
  });

  it('pearson = 1 con relación lineal creciente', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it('auc = 1 cuando el score separa perfectamente las clases', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
  });

  it('auc ≈ 0.5 con una sola clase presente', () => {
    expect(auc([0.1, 0.9], [1, 1])).toBe(0.5);
  });
});

describe('calibrationStudy', () => {
  it('recupera la dificultad b con alta correlación y bajo sesgo', () => {
    const rng = makeRng(SEED);
    const res = calibrationStudy({ examinees: 800, items: 40 }, rng);
    expect(res.calibratedItems).toBeGreaterThan(30);
    // La dificultad es el parámetro que el heurístico recupera mejor.
    expect(res.bCorr).toBeGreaterThan(0.9);
    expect(Math.abs(res.bBias)).toBeLessThan(0.3);
    // La discriminación es más ruidosa, pero la correlación debe ser positiva.
    expect(res.aCorr).toBeGreaterThan(0.3);
  });
});

describe('catStudy', () => {
  it('recupera θ con correlación alta y SE bajo el umbral', () => {
    const rng = makeRng(SEED);
    const res = catStudy(
      {
        examinees: 400,
        bankSize: 300,
        criteria: { minItems: 5, maxItems: 20, seThreshold: 0.3 },
      },
      rng,
    );
    expect(res.thetaCorr).toBeGreaterThan(0.9);
    expect(res.thetaRmse).toBeLessThan(0.5);
    expect(Math.abs(res.thetaBias)).toBeLessThan(0.2);
    // El SE medio final no debería exceder demasiado el umbral pedido.
    expect(res.meanFinalSe).toBeLessThan(0.4);
    expect(res.meanTestLength).toBeGreaterThanOrEqual(5);
    expect(res.meanTestLength).toBeLessThanOrEqual(20);
    expect(res.rmseByBand).toHaveLength(3);
  });
});

describe('bktStudy', () => {
  it('predice la respuesta siguiente mejor que el azar (AUC > 0.5)', () => {
    const rng = makeRng(SEED);
    const res = bktStudy(
      {
        students: 200,
        opportunities: 15,
        priorPKnow: 0.2,
        params: { pTransit: 0.15, pSlip: 0.1, pGuess: 0.2 },
      },
      rng,
    );
    expect(res.observations).toBe(200 * 15);
    expect(res.auc).toBeGreaterThan(0.5);
    expect(res.meanPredicted).toBeGreaterThan(0);
    expect(res.meanPredicted).toBeLessThan(1);
  });
});
