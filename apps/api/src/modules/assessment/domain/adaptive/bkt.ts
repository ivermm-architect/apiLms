// Bayesian Knowledge Tracing (BKT).
// Actualiza P(conoce) por competencia ante evidencia (acierto/fallo).
// Matemática pura y determinista — RNF-07.
// NÚCLEO CANÓNICO: no reescribir por IA; ver nota en ./index.ts.

export interface BktParams {
  /** P(transición): probabilidad de aprender tras una oportunidad. */
  pTransit: number;
  /** P(slip): probabilidad de fallar conociendo. */
  pSlip: number;
  /** P(guess): probabilidad de acertar sin conocer. */
  pGuess: number;
}

/**
 * P(respuesta correcta) dado el estado de conocimiento actual.
 * P(correcto) = pKnow·(1 - pSlip) + (1 - pKnow)·pGuess
 */
export function predictCorrect(pKnow: number, params: BktParams): number {
  return pKnow * (1 - params.pSlip) + (1 - pKnow) * params.pGuess;
}

/**
 * Actualiza P(conoce) tras observar una respuesta.
 * 1) Posterior por evidencia (Bayes).
 * 2) Transición de aprendizaje.
 * Devuelve el nuevo P(conoce) en [0, 1].
 */
export function updateBKT(pKnow: number, correct: boolean, params: BktParams): number {
  const { pTransit, pSlip, pGuess } = params;

  let posterior: number;
  if (correct) {
    const num = pKnow * (1 - pSlip);
    const den = num + (1 - pKnow) * pGuess;
    posterior = den === 0 ? pKnow : num / den;
  } else {
    const num = pKnow * pSlip;
    const den = num + (1 - pKnow) * (1 - pGuess);
    posterior = den === 0 ? pKnow : num / den;
  }

  const next = posterior + (1 - posterior) * pTransit;
  return Math.min(1, Math.max(0, next));
}
