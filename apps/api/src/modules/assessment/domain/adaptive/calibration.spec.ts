import { describe, expect, it } from 'vitest';

import { calibrateItem, ItemResponseDatum } from './calibration';

describe('calibrateItem', () => {
  it('devuelve null sin muestra suficiente', () => {
    const data: ItemResponseDatum[] = [{ correct: true, totalScore: 10 }];
    expect(calibrateItem(data, 10)).toBeNull();
  });

  it('un ítem fácil (alta proporción de aciertos) tiene b bajo', () => {
    const data: ItemResponseDatum[] = Array.from({ length: 20 }, (_, i) => ({
      correct: i < 17, // 85% aciertos
      totalScore: i,
    }));
    const res = calibrateItem(data);
    expect(res).not.toBeNull();
    expect(res!.b).toBeLessThan(0);
    expect(res!.sampleSize).toBe(20);
  });

  it('un ítem difícil (baja proporción de aciertos) tiene b alto', () => {
    const data: ItemResponseDatum[] = Array.from({ length: 20 }, (_, i) => ({
      correct: i < 4, // 20% aciertos
      totalScore: i,
    }));
    const res = calibrateItem(data);
    expect(res).not.toBeNull();
    expect(res!.b).toBeGreaterThan(0);
  });

  it('discriminación positiva cuando aciertan los de mayor puntaje total', () => {
    // Los de puntaje alto aciertan; los de puntaje bajo fallan => a alto.
    const data: ItemResponseDatum[] = Array.from({ length: 20 }, (_, i) => ({
      correct: i >= 10,
      totalScore: i,
    }));
    const res = calibrateItem(data);
    expect(res).not.toBeNull();
    // Discriminación claramente positiva (muy por encima del piso 0.2).
    expect(res!.a).toBeGreaterThan(0.4);
  });

  it('acota los parámetros a rangos razonables', () => {
    const data: ItemResponseDatum[] = Array.from({ length: 30 }, (_, i) => ({
      correct: i % 2 === 0,
      totalScore: i,
    }));
    const res = calibrateItem(data)!;
    expect(res.a).toBeGreaterThanOrEqual(0.2);
    expect(res.a).toBeLessThanOrEqual(3);
    expect(res.b).toBeGreaterThanOrEqual(-4);
    expect(res.b).toBeLessThanOrEqual(4);
  });
});
