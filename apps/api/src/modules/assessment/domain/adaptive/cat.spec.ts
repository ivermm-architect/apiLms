import { describe, expect, it } from 'vitest';

import {
  estimateTheta,
  selectNextItem,
  shouldStop,
  CatItem,
  CatResponse,
} from './cat';
import { prob2PL } from './irt';

// PRNG determinista (mulberry32) para recuperación de parámetros reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Banco sintético de ítems con dificultades espaciadas.
function buildPool(n: number): CatItem[] {
  const items: CatItem[] = [];
  for (let i = 0; i < n; i++) {
    const b = -3 + (6 * i) / (n - 1); // dificultad en [-3, 3]
    items.push({ id: `item-${i}`, a: 1.2, b });
  }
  return items;
}

// Simula respuestas para un θ verdadero usando el modelo 2PL y un PRNG sembrado.
function simulate(pool: CatItem[], trueTheta: number, rng: () => number): CatResponse[] {
  return pool.map((item) => ({ item, correct: rng() < prob2PL(trueTheta, item) }));
}

describe('selectNextItem', () => {
  it('elige el ítem con dificultad más cercana a θ (máxima información)', () => {
    const pool: CatItem[] = [
      { id: 'a', a: 1, b: -2 },
      { id: 'b', a: 1, b: 0.1 },
      { id: 'c', a: 1, b: 2 },
    ];
    expect(selectNextItem(pool, 0)?.id).toBe('b');
  });

  it('prefiere mayor discriminación a igual dificultad', () => {
    const pool: CatItem[] = [
      { id: 'low', a: 0.5, b: 0 },
      { id: 'high', a: 2.5, b: 0 },
    ];
    expect(selectNextItem(pool, 0)?.id).toBe('high');
  });

  it('devuelve null con pool vacío', () => {
    expect(selectNextItem([], 0)).toBeNull();
  });
});

describe('estimateTheta (EAP)', () => {
  it('sin respuestas devuelve el prior', () => {
    const { theta, se } = estimateTheta([]);
    expect(theta).toBeCloseTo(0, 6);
    expect(se).toBeCloseTo(1, 2);
  });

  it('el SE disminuye al acumular respuestas informativas', () => {
    const pool = buildPool(40);
    const rng = mulberry32(123);
    const responses = simulate(pool, 0.8, rng);
    const few = estimateTheta(responses.slice(0, 5));
    const many = estimateTheta(responses);
    expect(many.se).toBeLessThan(few.se);
  });

  it('recupera θ verdadero sobre datos sintéticos (determinista)', () => {
    const pool = buildPool(60);
    for (const trueTheta of [-1.5, 0, 1.2]) {
      const rng = mulberry32(42);
      const responses = simulate(pool, trueTheta, rng);
      const { theta } = estimateTheta(responses);
      expect(Math.abs(theta - trueTheta)).toBeLessThan(0.5);
    }
  });

  it('es reproducible: misma semilla => misma estimación', () => {
    const pool = buildPool(30);
    const a = estimateTheta(simulate(pool, 0.5, mulberry32(7)));
    const b = estimateTheta(simulate(pool, 0.5, mulberry32(7)));
    expect(a.theta).toBe(b.theta);
    expect(a.se).toBe(b.se);
  });
});

describe('shouldStop', () => {
  const criteria = { minItems: 5, maxItems: 20, seThreshold: 0.3 };

  it('detiene al alcanzar maxItems aunque el SE sea alto', () => {
    expect(shouldStop(20, 0.9, criteria)).toBe(true);
  });

  it('detiene tras minItems si el SE baja del umbral', () => {
    expect(shouldStop(6, 0.25, criteria)).toBe(true);
  });

  it('no detiene antes de minItems aunque el SE sea bajo', () => {
    expect(shouldStop(3, 0.1, criteria)).toBe(false);
  });

  it('no detiene si el SE sigue alto entre min y max', () => {
    expect(shouldStop(10, 0.5, criteria)).toBe(false);
  });
});
