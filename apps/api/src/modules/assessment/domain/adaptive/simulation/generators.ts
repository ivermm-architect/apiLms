// Generadores de datos sintéticos para la simulación.
// Examinados con habilidad θ latente conocida, banco de ítems con parámetros
// (a, b, c) generativos conocidos, y respuestas simuladas desde el modelo TRI.

import { prob2PL, IrtItemParams } from '../irt';

import { bernoulli, gaussian, Rng, uniform } from './rng';

export interface Examinee {
  id: string;
  /** Habilidad verdadera (latente). */
  theta: number;
}

export interface GenItem extends IrtItemParams {
  id: string;
}

/** Genera N examinados con θ ~ N(priorMean, priorSd). */
export function generateExaminees(n: number, rng: Rng, priorMean = 0, priorSd = 1): Examinee[] {
  const out: Examinee[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `ex-${i}`, theta: gaussian(rng, priorMean, priorSd) });
  }
  return out;
}

export interface BankOptions {
  /** Rango de discriminación a ~ U(aMin, aMax). */
  aMin?: number;
  aMax?: number;
  /** Dificultad b ~ N(0, bSd). */
  bSd?: number;
  /** Pseudo-adivinación fija (0 = 2PL; ej. 0.2 = 3PL para misspecificación). */
  c?: number;
}

const DEFAULT_BANK: Required<BankOptions> = { aMin: 0.5, aMax: 2.5, bSd: 1, c: 0 };

/** Genera un banco de N ítems con parámetros conocidos. */
export function generateItemBank(n: number, rng: Rng, options: BankOptions = {}): GenItem[] {
  const { aMin, aMax, bSd, c } = { ...DEFAULT_BANK, ...options };
  const out: GenItem[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `item-${i}`,
      a: uniform(rng, aMin, aMax),
      b: gaussian(rng, 0, bSd),
      c,
    });
  }
  return out;
}

/** Simula una respuesta (1/0) del examinado al ítem bajo el modelo TRI. */
export function simulateResponse(theta: number, item: IrtItemParams, rng: Rng): 0 | 1 {
  return bernoulli(rng, prob2PL(theta, item));
}

/**
 * Matriz de respuestas R[e][i] para todos los examinados × ítems.
 * Es la base de datos observada que alimenta la calibración.
 */
export function simulateResponseMatrix(
  examinees: readonly Examinee[],
  items: readonly GenItem[],
  rng: Rng,
): (0 | 1)[][] {
  return examinees.map((ex) => items.map((it) => simulateResponse(ex.theta, it, rng)));
}
