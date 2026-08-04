// Calibración clásica → TRI (aproximación, no MMLE completa).
// Estima (a, b) del modelo 2PL a partir de respuestas observadas:
//  - b (dificultad): logit de la proporción de aciertos (invertida).
//  - a (discriminación): correlación punto-biserial ítem–puntaje total.
// NÚCLEO CANÓNICO: la IA solo aporta semillas en cold-start (capa externa),
// nunca sustituye esta calibración empírica; ver nota en ./index.ts.
// Es una heurística documentada, adecuada para el alcance de la tesis;
// no sustituye una calibración MMLE/EM sobre el banco completo.

export interface ItemResponseDatum {
  /** ¿El estudiante acertó el ítem? */
  correct: boolean;
  /** Puntaje total del estudiante en el intento (para el punto-biserial). */
  totalScore: number;
}

export interface CalibrationResult {
  a: number;
  b: number;
  sampleSize: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * Calibra un ítem. Requiere al menos `minSample` respuestas; de lo contrario
 * devuelve null (no hay evidencia suficiente para estimar parámetros).
 */
export function calibrateItem(
  data: readonly ItemResponseDatum[],
  minSample = 10,
): CalibrationResult | null {
  const n = data.length;
  if (n < minSample) return null;

  // Proporción de aciertos, acotada para evitar logit infinito.
  const pCorrect = clamp(data.filter((d) => d.correct).length / n, 0.02, 0.98);
  // b = -logit(p) / D, con D=1.7 (constante de escala logística → normal).
  const b = clamp(-Math.log(pCorrect / (1 - pCorrect)) / 1.7, -4, 4);

  // Punto-biserial: correlación entre acierto (0/1) y puntaje total.
  const scores = data.map((d) => d.totalScore);
  const meanScore = scores.reduce((s, x) => s + x, 0) / n;
  const sdScore = Math.sqrt(
    scores.reduce((s, x) => s + (x - meanScore) * (x - meanScore), 0) / n,
  );

  let a = 1; // default neutro si no hay varianza de puntaje
  if (sdScore > 0) {
    const correctScores = data.filter((d) => d.correct).map((d) => d.totalScore);
    const nc = correctScores.length;
    if (nc > 0 && nc < n) {
      const meanCorrect = correctScores.reduce((s, x) => s + x, 0) / nc;
      const pq = Math.sqrt((nc / n) * (1 - nc / n));
      const pointBiserial = ((meanCorrect - meanScore) / sdScore) * pq;
      // Mapea r_pb ∈ [-1,1] a una discriminación positiva razonable.
      a = clamp(pointBiserial / Math.sqrt(Math.max(1e-6, 1 - pointBiserial * pointBiserial)), 0.2, 3);
    }
  }

  return { a, b, sampleSize: n };
}
