// Corrección de una respuesta (dicotómica) — pura y testeable.
// Comparte la lógica entre el flujo clásico y el adaptativo.
// NÚCLEO CANÓNICO: no reescribir por IA; ver nota en ./index.ts.

export interface GradableQuestion {
  questionType: string;
  options?: Array<{ id: string; text: string; isCorrect: boolean }> | null;
  correctAnswer?: string | null;
}

/**
 * Determina si una respuesta es correcta.
 * - multiple_choice: el `answer` es el id de la opción; correcto si esa opción es correcta.
 * - resto (true_false, fill_blank): compara contra `correctAnswer` (case/space-insensitive).
 * Las preguntas abiertas ('open') no se autocalifican.
 */
export function scoreAnswer(q: GradableQuestion, answer: string): boolean {
  if (q.questionType === 'open') return false;
  if (q.questionType === 'multiple_choice' && q.options) {
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    return correctIds.includes(answer);
  }
  if (q.correctAnswer) {
    return answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
  }
  return false;
}

/**
 * Mapea una habilidad θ a un nivel de dominio normalizado 0..1 (logística estándar).
 */
export function thetaToMastery(theta: number): number {
  return 1 / (1 + Math.exp(-theta));
}

export type MasteryStatus = 'no_iniciada' | 'en_progreso' | 'en_riesgo' | 'dominada';

/**
 * Clasifica el estado de dominio a partir del nivel normalizado (0..1).
 */
export function masteryStatus(mastery: number): MasteryStatus {
  if (mastery >= 0.75) return 'dominada';
  if (mastery < 0.4) return 'en_riesgo';
  return 'en_progreso';
}
