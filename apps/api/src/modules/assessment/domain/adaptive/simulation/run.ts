// Runner Monte-Carlo del harness de simulación.
// Corre cada estudio con R réplicas (semilla distinta por réplica),
// agrega media ± desviación estándar de cada métrica, imprime un reporte
// legible y vuelca los resultados a results/ (JSON) para el anexo de tesis.
//
// Ejecutar:  pnpm --filter @cieba/api simulate
//   (equivale a: node -r @swc-node/register src/.../simulation/run.ts)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { mean, stddev } from './metrics';
import { makeRng } from './rng';
import {
  BktResultMetrics,
  CalibrationResultMetrics,
  CatResultMetrics,
  bktStudy,
  calibrationStudy,
  catStudy,
} from './studies';

/* ─── Parámetros del experimento (acordados para defensa) ───── */

const REPLICATIONS = 100;
const BASE_SEED = 20260730;

const CALIBRATION = { examinees: 1000, items: 40 };
const CAT = {
  examinees: 1500,
  bankSize: 300,
  criteria: { minItems: 5, maxItems: 20, seThreshold: 0.3 },
};
const BKT = {
  students: 200,
  opportunities: 15,
  priorPKnow: 0.2,
  params: { pTransit: 0.15, pSlip: 0.1, pGuess: 0.2 },
};

/* ─── Agregación de réplicas ────────────────────────────────── */

interface Stat {
  mean: number;
  sd: number;
}

/** Media ± sd de una métrica escalar a lo largo de las réplicas. */
function agg(values: number[]): Stat {
  return { mean: mean(values), sd: stddev(values) };
}

/** Recolecta el valor de una clave numérica en todas las réplicas. */
function pluck<T>(runs: readonly T[], key: keyof T): number[] {
  return runs.map((r) => r[key] as unknown as number);
}

function fmt(s: Stat, digits = 3): string {
  return `${s.mean.toFixed(digits)} ± ${s.sd.toFixed(digits)}`;
}

/* ─── Estudio 1: Calibración TRI (2PL bien especificado) ────── */

function runCalibration(generatingC: number): {
  aBias: Stat;
  aRmse: Stat;
  aCorr: Stat;
  bBias: Stat;
  bRmse: Stat;
  bCorr: Stat;
  calibratedItems: Stat;
} {
  const runs: CalibrationResultMetrics[] = [];
  for (let r = 0; r < REPLICATIONS; r++) {
    const rng = makeRng(BASE_SEED + r);
    runs.push(
      calibrationStudy(
        { examinees: CALIBRATION.examinees, items: CALIBRATION.items, generatingC },
        rng,
      ),
    );
  }
  return {
    aBias: agg(pluck(runs, 'aBias')),
    aRmse: agg(pluck(runs, 'aRmse')),
    aCorr: agg(pluck(runs, 'aCorr')),
    bBias: agg(pluck(runs, 'bBias')),
    bRmse: agg(pluck(runs, 'bRmse')),
    bCorr: agg(pluck(runs, 'bCorr')),
    calibratedItems: agg(pluck(runs, 'calibratedItems')),
  };
}

/* ─── Estudio 2: CAT (recuperación de θ) ────────────────────── */

function runCat(): {
  thetaBias: Stat;
  thetaRmse: Stat;
  thetaCorr: Stat;
  meanTestLength: Stat;
  meanFinalSe: Stat;
  rmseByBand: { band: string; rmse: Stat; n: Stat }[];
} {
  const runs: CatResultMetrics[] = [];
  for (let r = 0; r < REPLICATIONS; r++) {
    const rng = makeRng(BASE_SEED + 1_000 + r);
    runs.push(
      catStudy(
        { examinees: CAT.examinees, bankSize: CAT.bankSize, criteria: CAT.criteria },
        rng,
      ),
    );
  }
  const bandNames = runs[0]!.rmseByBand.map((b) => b.band);
  const rmseByBand = bandNames.map((band, i) => ({
    band,
    rmse: agg(runs.map((run) => run.rmseByBand[i]!.rmse)),
    n: agg(runs.map((run) => run.rmseByBand[i]!.n)),
  }));
  return {
    thetaBias: agg(pluck(runs, 'thetaBias')),
    thetaRmse: agg(pluck(runs, 'thetaRmse')),
    thetaCorr: agg(pluck(runs, 'thetaCorr')),
    meanTestLength: agg(pluck(runs, 'meanTestLength')),
    meanFinalSe: agg(pluck(runs, 'meanFinalSe')),
    rmseByBand,
  };
}

/* ─── Estudio 3: BKT (predicción de la siguiente respuesta) ── */

function runBkt(): {
  auc: Stat;
  accuracy: Stat;
  meanPredicted: Stat;
  observations: Stat;
} {
  const runs: BktResultMetrics[] = [];
  for (let r = 0; r < REPLICATIONS; r++) {
    const rng = makeRng(BASE_SEED + 2_000 + r);
    runs.push(
      bktStudy(
        {
          students: BKT.students,
          opportunities: BKT.opportunities,
          priorPKnow: BKT.priorPKnow,
          params: BKT.params,
        },
        rng,
      ),
    );
  }
  return {
    auc: agg(pluck(runs, 'auc')),
    accuracy: agg(pluck(runs, 'accuracy')),
    meanPredicted: agg(pluck(runs, 'meanPredicted')),
    observations: agg(pluck(runs, 'observations')),
  };
}

/* ─── Ejecución + reporte ───────────────────────────────────── */

function main(): void {
  const startedAt = new Date().toISOString();
  const cal2pl = runCalibration(0);
  const cal3pl = runCalibration(0.2); // misspecificación: datos 3PL, ajuste 2PL
  const cat = runCat();
  const bkt = runBkt();

  const lines: string[] = [];
  const p = (s = ''): void => {
    lines.push(s);
  };

  p('══════════════════════════════════════════════════════════');
  p(` Simulación Monte-Carlo — Motor Adaptativo (${REPLICATIONS} réplicas)`);
  p(` Semilla base: ${BASE_SEED}   ·   ${startedAt}`);
  p('══════════════════════════════════════════════════════════');
  p();
  p('── 1. Calibración TRI (2PL) ─────────────────────────────');
  p(`  N=${CALIBRATION.examinees} examinados · ${CALIBRATION.items} ítems`);
  p(`  a  (discriminación):  bias ${fmt(cal2pl.aBias)}  rmse ${fmt(cal2pl.aRmse)}  r ${fmt(cal2pl.aCorr)}`);
  p(`  b  (dificultad):      bias ${fmt(cal2pl.bBias)}  rmse ${fmt(cal2pl.bRmse)}  r ${fmt(cal2pl.bCorr)}`);
  p(`  ítems calibrados:     ${fmt(cal2pl.calibratedItems, 1)}`);
  p();
  p('── 1b. Misspecificación (datos 3PL c=0.2, ajuste 2PL) ───');
  p(`  a  (discriminación):  bias ${fmt(cal3pl.aBias)}  rmse ${fmt(cal3pl.aRmse)}  r ${fmt(cal3pl.aCorr)}`);
  p(`  b  (dificultad):      bias ${fmt(cal3pl.bBias)}  rmse ${fmt(cal3pl.bRmse)}  r ${fmt(cal3pl.bCorr)}`);
  p();
  p('── 2. CAT (recuperación de θ) ───────────────────────────');
  p(`  N=${CAT.examinees} examinados · banco ${CAT.bankSize} · SE≤${CAT.criteria.seThreshold} · ${CAT.criteria.minItems}–${CAT.criteria.maxItems} ítems`);
  p(`  θ:  bias ${fmt(cat.thetaBias)}  rmse ${fmt(cat.thetaRmse)}  r ${fmt(cat.thetaCorr)}`);
  p(`  longitud media test:  ${fmt(cat.meanTestLength, 1)}`);
  p(`  SE final media:       ${fmt(cat.meanFinalSe)}`);
  for (const b of cat.rmseByBand) {
    p(`  RMSE θ en ${b.band.padEnd(8)}: ${fmt(b.rmse)}  (n ${fmt(b.n, 0)})`);
  }
  p();
  p('── 3. BKT (predicción respuesta siguiente) ──────────────');
  p(`  N=${BKT.students} alumnos · ${BKT.opportunities} oportunidades`);
  p(`  AUC:                  ${fmt(bkt.auc)}`);
  p(`  accuracy (umbral .5): ${fmt(bkt.accuracy)}`);
  p(`  P̂ media:              ${fmt(bkt.meanPredicted)}`);
  p(`  observaciones:        ${fmt(bkt.observations, 0)}`);
  p('══════════════════════════════════════════════════════════');

  const report = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(report);

  const outDir = join(__dirname, 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const payload = {
    startedAt,
    replications: REPLICATIONS,
    baseSeed: BASE_SEED,
    config: { calibration: CALIBRATION, cat: CAT, bkt: BKT },
    results: { calibration2pl: cal2pl, calibration3pl: cal3pl, cat, bkt },
  };
  writeFileSync(join(outDir, `sim-${stamp}.json`), JSON.stringify(payload, null, 2));
  writeFileSync(join(outDir, 'sim-latest.json'), JSON.stringify(payload, null, 2));
  writeFileSync(join(outDir, 'sim-latest.txt'), report + '\n');
  // eslint-disable-next-line no-console
  console.log(`\nResultados guardados en ${outDir}`);
}

main();
