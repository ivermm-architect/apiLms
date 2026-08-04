import { describe, expect, it } from 'vitest';

import { predictCorrect, updateBKT, BktParams } from './bkt';

const params: BktParams = { pTransit: 0.2, pSlip: 0.1, pGuess: 0.2 };

describe('updateBKT', () => {
  it('un acierto aumenta P(conoce)', () => {
    const p0 = 0.3;
    const p1 = updateBKT(p0, true, params);
    expect(p1).toBeGreaterThan(p0);
  });

  it('un fallo reduce el posterior por evidencia respecto a un acierto', () => {
    const afterCorrect = updateBKT(0.5, true, params);
    const afterWrong = updateBKT(0.5, false, params);
    expect(afterWrong).toBeLessThan(afterCorrect);
  });

  it('mantiene P(conoce) dentro de [0, 1]', () => {
    let p = 0.1;
    for (let i = 0; i < 50; i++) p = updateBKT(p, i % 3 !== 0, params);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('aciertos consecutivos convergen hacia el dominio (~1)', () => {
    let p = 0.1;
    for (let i = 0; i < 30; i++) p = updateBKT(p, true, params);
    expect(p).toBeGreaterThan(0.95);
  });

  it('es determinista: misma entrada => misma salida', () => {
    expect(updateBKT(0.42, true, params)).toBe(updateBKT(0.42, true, params));
  });
});

describe('predictCorrect', () => {
  it('con dominio pleno tiende a 1 - pSlip', () => {
    expect(predictCorrect(1, params)).toBeCloseTo(1 - params.pSlip, 10);
  });

  it('sin conocimiento tiende a pGuess', () => {
    expect(predictCorrect(0, params)).toBeCloseTo(params.pGuess, 10);
  });

  it('crece con P(conoce)', () => {
    expect(predictCorrect(0.8, params)).toBeGreaterThan(predictCorrect(0.2, params));
  });
});
