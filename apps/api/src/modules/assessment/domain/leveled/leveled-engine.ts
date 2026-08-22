// Motor DETERMINISTA de la evaluación adaptativa por niveles ("leveled").
//
// Capa CANÓNICA de la tesis: la dificultad se adapta por REGLAS simples
// (acierto → sube; fallo → baja) sobre una escalera easy | medium | hard, y la
// DECISIÓN de recomendación (refuerzo/avance) se toma comparando el score con
// el umbral de aprobación. 100% reproducible, sin IA.
//
// La IA (opcional) sólo redacta el texto `reason`; `baseReason` es el fallback
// determinista que se usa cuando la IA está apagada o falla. Funciones PURAS,
// sin dependencias, siguiendo el patrón de domain/adaptive/.

export type Difficulty = 'easy' | 'medium' | 'hard';
export type RecommendationType = 'refuerzo' | 'avance';

// Escalera ordenada de menor a mayor dificultad.
const LADDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Siguiente nivel de dificultad según el resultado de la pregunta actual.
 * Acierto sube un peldaño (tope 'hard'); fallo baja uno (piso 'easy').
 */
export function nextDifficulty(current: Difficulty, wasCorrect: boolean): Difficulty {
  const idx = LADDER.indexOf(current);
  const nextIdx = wasCorrect ? Math.min(idx + 1, LADDER.length - 1) : Math.max(idx - 1, 0);
  return LADDER[nextIdx]!;
}

/**
 * Score = porcentaje de aciertos (0..100, redondeado). `total <= 0` → 0.
 */
export function computeScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  const pct = (correct / total) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/**
 * Decisión DETERMINISTA de recomendación + texto base (fallback de IA).
 * `score < passingScore` → 'refuerzo'; en caso contrario → 'avance'.
 */
export function buildRecommendation(input: {
  score: number;
  passingScore: number;
  lastLevel: Difficulty;
}): { type: RecommendationType; baseReason: string } {
  const { score, passingScore, lastLevel } = input;

  if (score < passingScore) {
    return {
      type: 'refuerzo',
      baseReason:
        `Dominio insuficiente (${score}% < ${passingScore}%); ` +
        `se recomienda reforzar la clase de nivel ${lastLevel}.`,
    };
  }

  return {
    type: 'avance',
    baseReason:
      `Dominio suficiente (${score}% ≥ ${passingScore}%); ` +
      `se recomienda avanzar a la siguiente clase.`,
  };
}

/**
 * Normaliza la dificultad de un ítem al dominio de la escalera. El enum de BD
 * incluye 'adaptive' (para el flujo IRT); en el flujo leveled se trata como
 * 'medium' (peldaño central), garantizando un valor siempre válido.
 */
export function toDifficulty(value: string | null | undefined): Difficulty {
  return value === 'easy' || value === 'hard' ? value : 'medium';
}
