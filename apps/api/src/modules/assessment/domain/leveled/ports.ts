// Puerto (hexagonal) para la REDACCIÓN ASISTIDA POR IA de la justificación de
// una recomendación (`reason`). Capa OPCIONAL y NO CANÓNICA: la DECISIÓN
// refuerzo/avance la toma el motor determinista (leveled-engine); la IA sólo
// convierte esa decisión en lenguaje natural.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve
// `null` ante IA deshabilitada, error, timeout o respuesta inválida. Con `null`
// el caller usa el `baseReason` determinista como fallback.

import { Difficulty, RecommendationType } from './leveled-engine';

export interface RecommendationReasonInput {
  /** Decisión determinista ya tomada por el motor. */
  recommendationType: RecommendationType;
  /** Porcentaje de aciertos del intento (0..100). */
  score: number;
  /** Umbral de aprobación de la evaluación (0..100). */
  passingScore: number;
  /** Nivel de la última pregunta respondida. */
  lastLevel: Difficulty;
  /** Título de la evaluación/curso, como contexto opcional. */
  evaluationTitle?: string;
}

export interface RecommendationReasonPort {
  /**
   * Redacta la justificación en lenguaje natural para una recomendación ya
   * decidida. Devuelve `null` si la IA está deshabilitada o no puede redactar
   * con garantías (el caller usa entonces el texto determinista).
   */
  draftReason(input: RecommendationReasonInput): Promise<string | null>;
}

export const RECOMMENDATION_REASON = Symbol('RECOMMENDATION_REASON');
