// Puerto (hexagonal) para la SUGERENCIA DE PREGUNTAS ASISTIDA POR IA.
//
// Capa OPCIONAL: solo PROPONE borradores de preguntas para que el docente los
// revise y edite antes de crearlos con `addEvaluationQuestion`. NUNCA persiste
// ni publica nada por su cuenta.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve `[]`
// ante IA deshabilitada, error, timeout o respuesta inválida. Con `[]`, el
// docente sigue creando preguntas manualmente sin ninguna diferencia.

export type SuggestedQuestionType = 'multiple_choice' | 'true_false' | 'open';
export type SuggestedDifficulty = 'easy' | 'medium' | 'hard';

export interface QuestionSuggesterInput {
  /** Tema o contenido base (título + contenido de la lección, o tema libre). */
  topic: string;
  /** Tipo de pregunta a proponer. */
  questionType: SuggestedQuestionType;
  /** Nivel de dificultad pedagógico (sin adaptativo). */
  difficulty: SuggestedDifficulty;
  /** Cuántas preguntas proponer (1..10). */
  count: number;
}

export interface SuggestedOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface SuggestedQuestion {
  questionText: string;
  questionType: SuggestedQuestionType;
  /** Opciones para 'multiple_choice' (4) o 'true_false' (2). Vacío en 'open'. */
  options: SuggestedOption[];
  /** Respuesta correcta esperada para 'open'/'true_false' (referencia del docente). */
  correctAnswer: string | null;
  /** Explicación breve de por qué esa es la respuesta correcta. */
  explanation: string | null;
  difficulty: SuggestedDifficulty;
  /** Justificación en lenguaje natural de la propuesta (requisito de tesis). */
  justification: string;
}

export interface QuestionSuggesterPort {
  /**
   * Propone borradores de preguntas a partir de un tema/lección. Devuelve `[]`
   * si la IA está deshabilitada o no puede proponer con garantías.
   */
  suggest(input: QuestionSuggesterInput): Promise<SuggestedQuestion[]>;
}

export const QUESTION_SUGGESTER = Symbol('QUESTION_SUGGESTER');
