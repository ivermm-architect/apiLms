// Benchmark de latencia del motor CAT (RNF-07: "tiempo de selección de ítem acotado").
// Right-sized para un instituto: banco de ~250 ítems y sesiones de 20 ítems.
// Usa el `bench` nativo de Vitest (sin herramienta nueva). Datos deterministas
// vía LCG para que las cifras sean reproducibles entre corridas.
//
// Ejecutar: pnpm --filter @cieba/api bench

import { bench, describe } from 'vitest';

import {
  estimateTheta,
  selectNextItem,
  shouldStop,
  CatItem,
  CatResponse,
} from './cat';

// LCG determinista (Numerical Recipes) → banco calibrado reproducible.
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function buildBank(size: number, seed = 42): CatItem[] {
  const rng = makeRng(seed);
  const bank: CatItem[] = [];
  for (let i = 0; i < size; i++) {
    bank.push({
      id: `item-${i}`,
      a: 0.5 + rng() * 2, // discriminación ∈ [0.5, 2.5]
      b: -3 + rng() * 6, // dificultad ∈ [-3, 3]
      c: 0.2, // 3PL con pseudo-adivinación fija
    });
  }
  return bank;
}

const BANK_SIZE = 250;
const SESSION_LENGTH = 20;

const bank = buildBank(BANK_SIZE);

// Patrón de respuestas fijo (20 ítems) para medir estimateTheta de forma estable.
const fixedResponses: CatResponse[] = bank
  .slice(0, SESSION_LENGTH)
  .map((item, i) => ({ item, correct: i % 2 === 0 }));

describe('CAT · latencia', () => {
  // Hot path: elegir el ítem de máxima información sobre todo el banco.
  bench('selectNextItem sobre banco de 250 ítems', () => {
    selectNextItem(bank, 0.5);
  });

  // Estimación EAP por cuadratura con un patrón de 20 respuestas.
  bench('estimateTheta (EAP) con 20 respuestas', () => {
    estimateTheta(fixedResponses);
  });

  // Sesión adaptativa completa: seleccionar → responder → reestimar → parar.
  // Representa la latencia de un examen entero (el número real que importa).
  bench('sesión adaptativa completa (20 ítems)', () => {
    const responses: CatResponse[] = [];
    const administered = new Set<string>();
    let theta = 0;
    let se = Number.POSITIVE_INFINITY;
    const criteria = { minItems: 5, maxItems: SESSION_LENGTH, seThreshold: 0.3 };

    for (let n = 0; !shouldStop(n, se, criteria); n++) {
      const pool = bank.filter((it) => !administered.has(it.id));
      const next = selectNextItem(pool, theta);
      if (!next) break;
      administered.add(next.id);
      // Respuesta simulada determinista (alterna) — el bench mide cómputo, no IO.
      responses.push({ item: next, correct: n % 2 === 0 });
      const est = estimateTheta(responses);
      theta = est.theta;
      se = est.se;
    }
  });
});
