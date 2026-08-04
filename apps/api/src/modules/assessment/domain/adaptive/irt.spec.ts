import { describe, expect, it } from 'vitest';

import { fisherInfo, prob2PL } from './irt';

describe('prob2PL', () => {
  it('P = 0.5 cuando θ = b en 2PL', () => {
    expect(prob2PL(0, { a: 1, b: 0 })).toBeCloseTo(0.5, 10);
    expect(prob2PL(1.3, { a: 2, b: 1.3 })).toBeCloseTo(0.5, 10);
  });

  it('es monótona creciente en θ', () => {
    const params = { a: 1.2, b: 0.4 };
    const lo = prob2PL(-1, params);
    const mid = prob2PL(0.4, params);
    const hi = prob2PL(2, params);
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });

  it('respeta la asíntota inferior c en 3PL', () => {
    // θ muy por debajo de b => P ≈ c.
    expect(prob2PL(-20, { a: 1, b: 0, c: 0.25 })).toBeCloseTo(0.25, 4);
  });

  it('mayor discriminación => transición más abrupta en b', () => {
    const soft = prob2PL(0.5, { a: 0.5, b: 0 });
    const sharp = prob2PL(0.5, { a: 3, b: 0 });
    expect(sharp).toBeGreaterThan(soft);
  });
});

describe('fisherInfo', () => {
  it('la información 2PL es máxima en θ = b', () => {
    const params = { a: 1.5, b: 0.7 };
    const atB = fisherInfo(0.7, params);
    expect(atB).toBeGreaterThan(fisherInfo(0.7 - 1, params));
    expect(atB).toBeGreaterThan(fisherInfo(0.7 + 1, params));
    // Valor cerrado: a²·0.25 en θ=b.
    expect(atB).toBeCloseTo(1.5 * 1.5 * 0.25, 10);
  });

  it('crece con la discriminación en el pico', () => {
    expect(fisherInfo(0, { a: 2, b: 0 })).toBeGreaterThan(fisherInfo(0, { a: 1, b: 0 }));
  });

  it('es no negativa y finita en los extremos', () => {
    expect(fisherInfo(-50, { a: 1, b: 0 })).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(fisherInfo(50, { a: 1, b: 0, c: 0.2 }))).toBe(true);
  });
});
