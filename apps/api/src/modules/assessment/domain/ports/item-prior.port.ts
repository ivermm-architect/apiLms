// Puerto (hexagonal) para la INICIALIZACIÓN ASISTIDA POR IA de parámetros IRT.
//
// Capa OPCIONAL y NO CANÓNICA: solo aporta valores SEMILLA (a, b) del modelo
// TRI 2PL cuando NO hay evidencia empírica suficiente para calibrar (cold-start).
// JAMÁS sustituye la calibración empírica ni modifica las fórmulas del motor.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve
// `null` ante IA deshabilitada, error, timeout o respuesta inválida. Con `null`,
// el handler mantiene el comportamiento actual (calibrated:false).

export interface ItemPriorInput {
  /** Enunciado del ítem (evaluationQuestions.questionText). */
  statement: string;
  /** Textos de las opciones, si el ítem es de opción múltiple. */
  options?: string[];
  /** Nombre de la competencia asociada, como contexto opcional. */
  competency?: string;
}

export interface ItemPriorEstimate {
  /** Discriminación TRI 2PL, acotada a [0.2, 3]. */
  a: number;
  /** Dificultad TRI 2PL, acotada a [-4, 4]. */
  b: number;
  /** Confianza autoinformada del modelo, 0..1 (solo trazabilidad). */
  confidence: number;
}

export interface ItemPriorPort {
  /**
   * Estima parámetros semilla (a, b) para un ítem sin evidencia empírica.
   * Devuelve `null` si la IA está deshabilitada o no puede estimar con garantías.
   */
  estimatePriors(input: ItemPriorInput): Promise<ItemPriorEstimate | null>;
}

export const ITEM_PRIOR = Symbol('ITEM_PRIOR');
