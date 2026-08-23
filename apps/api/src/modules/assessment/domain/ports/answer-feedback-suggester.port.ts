// Puerto (hexagonal) para la SUGERENCIA DE RETROALIMENTACIÓN ASISTIDA POR IA
// al calificar respuestas abiertas.
//
// Capa OPCIONAL: solo PROPONE un borrador de retroalimentación en lenguaje natural
// para que el docente lo revise/edite antes de guardarlo con `gradeOpenAnswer`.
// NUNCA califica ni guarda nada por su cuenta.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve `null`
// ante IA deshabilitada, error, timeout o respuesta inválida. Con `null`, el docente
// escribe la retroalimentación manualmente sin ninguna diferencia.

export interface AnswerFeedbackSuggesterInput {
  /** Enunciado de la pregunta abierta. */
  questionText: string;
  /** Respuesta escrita por el estudiante. */
  studentAnswer: string;
  /** Respuesta esperada/referencia del docente (si existe). */
  expectedAnswer?: string | null;
  /** Puntaje máximo de la pregunta (contexto para el tono del comentario). */
  maxPoints: number;
}

export interface AnswerFeedbackSuggesterPort {
  /**
   * Propone un borrador de retroalimentación para el estudiante. Devuelve `null`
   * si la IA está deshabilitada o no puede proponer con garantías.
   */
  suggestFeedback(input: AnswerFeedbackSuggesterInput): Promise<string | null>;
}

export const ANSWER_FEEDBACK_SUGGESTER = Symbol('ANSWER_FEEDBACK_SUGGESTER');
