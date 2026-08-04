// Teoría de Respuesta al Ítem (TRI). Modelo logístico 2PL/3PL.
// a = discriminación, b = dificultad, c = pseudo-adivinación (0 => 2PL).
// Matemática pura y determinista (sin dependencias externas) — RNF-07.
// NÚCLEO CANÓNICO: no reescribir por IA; ver nota en ./index.ts.

export interface IrtItemParams {
  /** Discriminación (a). */
  a: number;
  /** Dificultad (b). */
  b: number;
  /** Pseudo-adivinación (c). 0 para 2PL. */
  c?: number;
}

/**
 * Probabilidad de respuesta correcta bajo el modelo 3PL (2PL si c=0).
 * P(θ) = c + (1 - c) / (1 + e^{-a (θ - b)})
 */
export function prob2PL(theta: number, params: IrtItemParams): number {
  const { a, b } = params;
  const c = params.c ?? 0;
  const logistic = 1 / (1 + Math.exp(-a * (theta - b)));
  return c + (1 - c) * logistic;
}

/**
 * Información de Fisher del ítem en θ.
 * 3PL: I(θ) = a² · (1 - P)/P · ((P - c)/(1 - c))²
 * 2PL (c=0): I(θ) = a² · P · (1 - P)
 */
export function fisherInfo(theta: number, params: IrtItemParams): number {
  const { a } = params;
  const c = params.c ?? 0;
  const p = prob2PL(theta, params);
  // Guarda numérica: evita división por cero en los extremos.
  if (p <= 0 || p >= 1) return 0;
  if (c === 0) return a * a * p * (1 - p);
  const num = (p - c) * (p - c);
  const den = (1 - c) * (1 - c);
  return a * a * ((1 - p) / p) * (num / den);
}
