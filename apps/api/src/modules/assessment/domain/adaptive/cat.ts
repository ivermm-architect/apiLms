// Computerized Adaptive Testing (CAT).
// Selección de ítem por máxima información, estimación de θ por EAP,
// y criterio de parada. Determinista — RNF-07.
// NÚCLEO CANÓNICO: no reescribir por IA; ver nota en ./index.ts.

import { fisherInfo, prob2PL, IrtItemParams } from './irt';

export interface CatItem extends IrtItemParams {
  id: string;
}

export interface CatResponse {
  item: CatItem;
  /** 1 = correcto, 0 = incorrecto. */
  correct: boolean;
}

export interface ThetaEstimate {
  /** Habilidad estimada (media posterior EAP). */
  theta: number;
  /** Error estándar (desviación estándar posterior). */
  se: number;
}

export interface StopCriteria {
  /** Mínimo de ítems antes de poder detener por SE. */
  minItems: number;
  /** Máximo de ítems (corte duro). */
  maxItems: number;
  /** Umbral de SE para detener. */
  seThreshold: number;
}

export interface EapOptions {
  /** Límite inferior de la grilla de cuadratura. */
  min?: number;
  /** Límite superior de la grilla de cuadratura. */
  max?: number;
  /** Paso de la grilla. */
  step?: number;
  /** Media del prior normal. */
  priorMean?: number;
  /** Desviación estándar del prior normal. */
  priorSd?: number;
}

const DEFAULT_EAP: Required<EapOptions> = {
  min: -4,
  max: 4,
  step: 0.05,
  priorMean: 0,
  priorSd: 1,
};

function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/**
 * Selecciona el ítem del pool que maximiza la información de Fisher en θ.
 * El `pool` debe excluir los ítems ya administrados. Devuelve null si vacío.
 */
export function selectNextItem(pool: readonly CatItem[], theta: number): CatItem | null {
  let best: CatItem | null = null;
  let bestInfo = -Infinity;
  for (const item of pool) {
    const info = fisherInfo(theta, item);
    if (info > bestInfo) {
      bestInfo = info;
      best = item;
    }
  }
  return best;
}

/**
 * Estimación EAP (Expected A Posteriori) de θ con prior normal, por cuadratura.
 * Devuelve la media y la desviación estándar posterior (SE).
 * Sin respuestas, devuelve el prior.
 */
export function estimateTheta(
  responses: readonly CatResponse[],
  options: EapOptions = {},
): ThetaEstimate {
  const { min, max, step, priorMean, priorSd } = { ...DEFAULT_EAP, ...options };

  let sumW = 0; // Σ posterior no normalizado
  let sumThetaW = 0; // Σ θ · posterior
  let sumTheta2W = 0; // Σ θ² · posterior

  for (let theta = min; theta <= max + 1e-9; theta += step) {
    // Verosimilitud del patrón de respuestas.
    let likelihood = 1;
    for (const r of responses) {
      const p = prob2PL(theta, r.item);
      likelihood *= r.correct ? p : 1 - p;
    }
    const w = likelihood * normalPdf(theta, priorMean, priorSd);
    sumW += w;
    sumThetaW += theta * w;
    sumTheta2W += theta * theta * w;
  }

  if (sumW === 0) return { theta: priorMean, se: priorSd };

  const mean = sumThetaW / sumW;
  const variance = Math.max(0, sumTheta2W / sumW - mean * mean);
  return { theta: mean, se: Math.sqrt(variance) };
}

/**
 * Criterio de parada del CAT.
 * Detiene si se alcanza el máximo de ítems, o si tras el mínimo el SE baja del umbral.
 */
export function shouldStop(
  administered: number,
  se: number,
  criteria: StopCriteria,
): boolean {
  if (administered >= criteria.maxItems) return true;
  if (administered >= criteria.minItems && se <= criteria.seThreshold) return true;
  return false;
}
