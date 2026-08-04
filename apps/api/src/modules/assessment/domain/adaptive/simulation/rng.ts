// Generador de números aleatorios determinista para la simulación.
// LCG (Numerical Recipes) + Box-Muller para normal + Bernoulli.
// Determinista por semilla => resultados reproducibles ante el jurado.

export type Rng = () => number;

/** LCG determinista. Devuelve uniforme en [0, 1). */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Muestra de una normal N(mean, sd) por transformación Box-Muller. */
export function gaussian(rng: Rng, mean = 0, sd = 1): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

/** Muestra uniforme en [lo, hi). */
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Ensayo Bernoulli: 1 con probabilidad p, 0 en caso contrario. */
export function bernoulli(rng: Rng, p: number): 0 | 1 {
  return rng() < p ? 1 : 0;
}
