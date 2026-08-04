// Estudios de recuperación (Monte-Carlo de una réplica).
// Cada estudio genera datos sintéticos, corre el estimador del motor y
// mide qué tan bien recupera los parámetros/estados verdaderos.

import { BktParams, predictCorrect, updateBKT } from '../bkt';
import { calibrateItem, ItemResponseDatum } from '../calibration';
import { CatItem, CatResponse, estimateTheta, selectNextItem, shouldStop, StopCriteria } from '../cat';

import {
  generateExaminees,
  generateItemBank,
  GenItem,
  simulateResponse,
  simulateResponseMatrix,
} from './generators';
import { auc, bias, mean, pearson, rmse } from './metrics';
import { bernoulli, Rng } from './rng';

/* ─── Calibración (TRI 2PL) ─────────────────────────────────── */

export interface CalibrationConfig {
  examinees: number;
  items: number;
  /** c generativo: 0 = datos 2PL; >0 = datos 3PL (misspecificación). */
  generatingC?: number;
}

export interface CalibrationResultMetrics {
  aBias: number;
  aRmse: number;
  aCorr: number;
  bBias: number;
  bRmse: number;
  bCorr: number;
  calibratedItems: number;
}

export function calibrationStudy(cfg: CalibrationConfig, rng: Rng): CalibrationResultMetrics {
  const examinees = generateExaminees(cfg.examinees, rng);
  const items = generateItemBank(cfg.items, rng, { c: cfg.generatingC ?? 0 });
  const matrix = simulateResponseMatrix(examinees, items, rng);

  // Puntaje total (número de aciertos) por examinado — insumo del punto-biserial.
  const totalScores = matrix.map((row) => row.reduce<number>((s, x) => s + x, 0));

  const aTrue: number[] = [];
  const aEst: number[] = [];
  const bTrue: number[] = [];
  const bEst: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const data: ItemResponseDatum[] = examinees.map((_, e) => ({
      correct: matrix[e]![i] === 1,
      totalScore: totalScores[e]!,
    }));
    const est = calibrateItem(data);
    if (!est) continue;
    aTrue.push(items[i]!.a);
    aEst.push(est.a);
    bTrue.push(items[i]!.b);
    bEst.push(est.b);
  }

  return {
    aBias: bias(aEst, aTrue),
    aRmse: rmse(aEst, aTrue),
    aCorr: pearson(aEst, aTrue),
    bBias: bias(bEst, bTrue),
    bRmse: rmse(bEst, bTrue),
    bCorr: pearson(bEst, bTrue),
    calibratedItems: aEst.length,
  };
}

/* ─── CAT (recuperación de θ) ───────────────────────────────── */

export interface CatConfig {
  examinees: number;
  bankSize: number;
  criteria: StopCriteria;
}

export interface CatResultMetrics {
  thetaBias: number;
  thetaRmse: number;
  thetaCorr: number;
  meanTestLength: number;
  meanFinalSe: number;
  /** RMSE por franja de habilidad verdadera. */
  rmseByBand: { band: string; rmse: number; n: number }[];
}

function runCatSession(
  bank: readonly CatItem[],
  trueTheta: number,
  criteria: StopCriteria,
  rng: Rng,
): { thetaHat: number; testLength: number; finalSe: number } {
  const administered = new Set<string>();
  const responses: CatResponse[] = [];
  let thetaHat = 0;
  let se = Number.POSITIVE_INFINITY;
  let n = 0;

  while (!shouldStop(n, se, criteria)) {
    const pool = bank.filter((it) => !administered.has(it.id));
    const next = selectNextItem(pool, thetaHat);
    if (!next) break;
    administered.add(next.id);
    const correct = simulateResponse(trueTheta, next, rng) === 1;
    responses.push({ item: next, correct });
    const est = estimateTheta(responses);
    thetaHat = est.theta;
    se = est.se;
    n++;
  }

  return { thetaHat, testLength: n, finalSe: se };
}

export function catStudy(cfg: CatConfig, rng: Rng): CatResultMetrics {
  const bank: GenItem[] = generateItemBank(cfg.bankSize, rng, { c: 0 });
  const examinees = generateExaminees(cfg.examinees, rng);

  const thetaTrue: number[] = [];
  const thetaEst: number[] = [];
  const lengths: number[] = [];
  const ses: number[] = [];

  for (const ex of examinees) {
    const r = runCatSession(bank, ex.theta, cfg.criteria, rng);
    thetaTrue.push(ex.theta);
    thetaEst.push(r.thetaHat);
    lengths.push(r.testLength);
    ses.push(r.finalSe);
  }

  // RMSE por franja de θ verdadero.
  const bands: { band: string; lo: number; hi: number }[] = [
    { band: '[-3,-1)', lo: -3, hi: -1 },
    { band: '[-1,1]', lo: -1, hi: 1 },
    { band: '(1,3]', lo: 1, hi: 3 },
  ];
  const rmseByBand = bands.map(({ band, lo, hi }) => {
    const est: number[] = [];
    const tru: number[] = [];
    for (let i = 0; i < thetaTrue.length; i++) {
      const t = thetaTrue[i]!;
      const inBand = band.startsWith('[-1') ? t >= lo && t <= hi : t > lo && t <= hi;
      if (inBand) {
        est.push(thetaEst[i]!);
        tru.push(t);
      }
    }
    return { band, rmse: rmse(est, tru), n: est.length };
  });

  return {
    thetaBias: bias(thetaEst, thetaTrue),
    thetaRmse: rmse(thetaEst, thetaTrue),
    thetaCorr: pearson(thetaEst, thetaTrue),
    meanTestLength: mean(lengths),
    meanFinalSe: mean(ses),
    rmseByBand,
  };
}

/* ─── BKT (predicción de la siguiente respuesta) ────────────── */

export interface BktConfig {
  students: number;
  opportunities: number;
  params: BktParams;
  /** P(conoce) inicial (prior). */
  priorPKnow: number;
}

export interface BktResultMetrics {
  auc: number;
  observations: number;
  meanPredicted: number;
  accuracy: number;
}

export function bktStudy(cfg: BktConfig, rng: Rng): BktResultMetrics {
  const { pTransit, pSlip, pGuess } = cfg.params;
  const predicted: number[] = [];
  const actual: (0 | 1)[] = [];

  for (let s = 0; s < cfg.students; s++) {
    // Estado latente verdadero del alumno (conoce / no conoce).
    let knownTrue = bernoulli(rng, cfg.priorPKnow) === 1;
    // Creencia del modelo sobre P(conoce), parte del prior.
    let pKnow = cfg.priorPKnow;

    for (let t = 0; t < cfg.opportunities; t++) {
      // El modelo predice ANTES de ver la respuesta.
      predicted.push(predictCorrect(pKnow, cfg.params));
      // Respuesta real generada desde el estado latente verdadero.
      const pReal = knownTrue ? 1 - pSlip : pGuess;
      const correct = bernoulli(rng, pReal);
      actual.push(correct);
      // El modelo actualiza su creencia.
      pKnow = updateBKT(pKnow, correct === 1, cfg.params);
      // Transición de aprendizaje del estado verdadero.
      if (!knownTrue && bernoulli(rng, pTransit) === 1) knownTrue = true;
    }
  }

  // Exactitud clasificando con umbral 0.5.
  let hits = 0;
  for (let i = 0; i < predicted.length; i++) {
    const pred = predicted[i]! >= 0.5 ? 1 : 0;
    if (pred === actual[i]) hits++;
  }

  return {
    auc: auc(predicted, actual),
    observations: predicted.length,
    meanPredicted: mean(predicted),
    accuracy: predicted.length === 0 ? 0 : hits / predicted.length,
  };
}
