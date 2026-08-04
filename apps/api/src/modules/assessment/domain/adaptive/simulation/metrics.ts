// Métricas de recuperación para validar los estimadores.
// bias (sesgo), RMSE (error cuadrático medio), correlación de Pearson y AUC.

/** Sesgo medio: promedio de (estimado - verdadero). */
export function bias(estimated: readonly number[], truth: readonly number[]): number {
  const n = estimated.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += estimated[i]! - truth[i]!;
  return s / n;
}

/** Raíz del error cuadrático medio entre estimado y verdadero. */
export function rmse(estimated: readonly number[], truth: readonly number[]): number {
  const n = estimated.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = estimated[i]! - truth[i]!;
    s += d * d;
  }
  return Math.sqrt(s / n);
}

/** Media de un vector. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Desviación estándar poblacional. */
export function stddev(xs: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / n);
}

/** Correlación de Pearson entre dos vectores. */
export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const den = Math.sqrt(vx * vy);
  return den === 0 ? 0 : cov / den;
}

/**
 * Área bajo la curva ROC (AUC) por el estadístico de Mann-Whitney U,
 * con rangos promediados para empates. `scores` = probabilidad predicha,
 * `labels` = resultado real (1 = acierto, 0 = fallo).
 */
export function auc(scores: readonly number[], labels: readonly (0 | 1)[]): number {
  const n = scores.length;
  if (n === 0) return 0.5;

  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a]! - scores[b]!);

  // Rangos con empates promediados (1-indexado).
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[idx[j + 1]!]! === scores[idx[i]!]!) j++;
    const avgRank = (i + j + 2) / 2; // media de rangos [i+1 .. j+1]
    for (let k = i; k <= j; k++) ranks[idx[k]!] = avgRank;
    i = j + 1;
  }

  let sumRankPos = 0;
  let nPos = 0;
  for (let k = 0; k < n; k++) {
    if (labels[k] === 1) {
      sumRankPos += ranks[k]!;
      nPos++;
    }
  }
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5; // sin ambas clases, AUC indefinida
  return (sumRankPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
