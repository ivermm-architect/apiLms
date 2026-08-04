import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

/* ─────────────────────────────────────────────────────────────
   CIEBA LMS · Seed adaptativo (TRI / CAT / BKT)
   Puebla las tablas del motor adaptativo sobre el seed base:
     · competencies            (por curso, desde sus secciones)
     · question_competencies   (mapeo pregunta ↔ competencia)
     · item_irt_params         (calibración TRI de cada ítem)
     · +60 ítems flagship (Farmacología, 4 competencias) para un CAT real de 5-15 ítems
     · ability_estimates / competency_progress / bkt_states (25 alumnos)

   Cifras ancladas a la literatura psicométrica:
     · IRT 2PL: a~U(0.5,2.0), b∈[-3,3], sample_size~U(400,800) (N≥500).
     · Banco CAT: 3× longitud del test (MAX_ITEMS=15) ⇒ ≥45; flagship=60.
     · BKT: pInit .10, pTransit .20, pSlip .10, pGuess .20
            (pSlip≤.1, pGuess≤.3, pG+pS<1, ambos <.5).
   Idempotente: reejecutable sin duplicar.
   ───────────────────────────────────────────────────────────── */

// Flagship del motor adaptativo: "Farmacología" (año 2). Es la materia con
// más competencias (4 secciones ⇒ 4 competencias), donde vive el cálculo de
// dosis; ideal para un CAT real. 15 ítems × 4 competencias = 60 ítems.
const FLAGSHIP_SLUG = 'farmacologia';
const FLAGSHIP_ITEMS_PER_COMPETENCY = 15;

// Parámetros BKT por defecto (dentro de las cotas de la literatura).
const BKT = { pTransit: 0.2, pSlip: 0.1, pGuess: 0.2 };

/* ─── RNG determinista (LCG + Box-Muller) ──────────────────── */

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const rng = makeRng(20260730);
const uniform = (lo: number, hi: number): number => lo + (hi - lo) * rng();
function gaussian(mean = 0, sd = 1): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round4 = (x: number): string => x.toFixed(4);

const logit = (p: number): number => {
  const c = clamp(p, 0.001, 0.999);
  return Math.log(c / (1 - c));
};

// Estado de dominio (misma regla que el dominio: grading.masteryStatus).
function masteryStatus(m: number): 'no_iniciada' | 'en_progreso' | 'en_riesgo' | 'dominada' {
  if (m >= 0.75) return 'dominada';
  if (m < 0.4) return 'en_riesgo';
  return 'en_progreso';
}

// Prefijo de 3 letras (A-Z) a partir del slug, para códigos de competencia.
function slugPrefix(slug: string): string {
  const letters = slug.replace(/[^a-z]/gi, '').toUpperCase();
  return (letters.slice(0, 3) || 'GEN').padEnd(3, 'X');
}

/* ─── Generadores de parámetros TRI ────────────────────────── */

// Ítem real (pregunta existente): dificultad centrada, discriminación media.
function irtForReal(): { a: string; b: string; c: string; sampleSize: string } {
  return {
    a: round4(clamp(uniform(0.6, 1.8), 0.2, 3)),
    b: round4(clamp(gaussian(0, 1), -3, 3)),
    c: '0.0000',
    sampleSize: String(Math.round(uniform(200, 500))),
  };
}

// Ítem sintético del banco flagship: b escalonado para cubrir todo el rango.
function irtForBank(
  step: number,
  total: number,
): { a: string; b: string; c: string; sampleSize: string } {
  // b uniforme en [-3, 3] según la posición del ítem dentro de la competencia.
  const b = -3 + (6 * step) / Math.max(1, total - 1) + uniform(-0.15, 0.15);
  return {
    a: round4(clamp(uniform(0.5, 2.0), 0.2, 3)),
    b: round4(clamp(b, -3, 3)),
    c: '0.0000',
    sampleSize: String(Math.round(uniform(400, 800))),
  };
}

/* ─── Main ─────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms';
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.info('🧠 Seed adaptativo (TRI/CAT/BKT)...');

  /* ── Cargar datos base ── */
  const courses = await db.select().from(schema.courses);
  const sections = await db.select().from(schema.sections);
  const evaluations = await db.select().from(schema.evaluations);
  const questions = await db.select().from(schema.evaluationQuestions);
  // Excluir egresados (status 'inactive'): el motor adaptativo refleja solo
  // alumnos vigentes, para que "en riesgo" y el dominio medio no incluyan
  // cohortes ya graduadas.
  const activeUserIds = new Set(
    (
      await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.status, 'active'))
    ).map((r) => r.id),
  );
  const enrollments = (await db.select().from(schema.enrollments)).filter((e) =>
    activeUserIds.has(e.userId),
  );

  // Golden demo student (debe coincidir con DEMO_CREDENTIALS.student del frontend):
  // se le asigna un patrón de dominio determinista para garantizar en la demo la
  // mezcla de estados en_riesgo + en_progreso + dominada, en vez de dejarlo al azar.
  const GOLDEN_STUDENT_EMAIL = 'estudiante071@cieba.edu.bo';
  const goldenUserId =
    (
      await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, GOLDEN_STUDENT_EMAIL))
    )[0]?.id ?? null;
  // Patrón cíclico: garantiza ≥1 en_riesgo (<0.4), ≥1 en_progreso (0.4–0.75) y ≥1 dominada (≥0.75).
  const GOLDEN_MASTERY = [0.3, 0.85, 0.55, 0.32, 0.9, 0.6, 0.28, 0.8];
  let goldenCompSeq = 0;

  const evalByCourse = new Map(evaluations.map((e) => [e.courseId, e]));
  const questionsByEval = new Map<string, typeof questions>();
  for (const q of questions) {
    const arr = questionsByEval.get(q.evaluationId) ?? [];
    arr.push(q);
    questionsByEval.set(q.evaluationId, arr);
  }
  const sectionsByCourse = new Map<string, typeof sections>();
  for (const s of sections) {
    const arr = sectionsByCourse.get(s.courseId) ?? [];
    arr.push(s);
    sectionsByCourse.set(s.courseId, arr);
  }

  /* ── 1. Competencias por curso (desde sus secciones) ── */
  console.info('  → Competencias (por curso, desde secciones)...');
  const existingComps = await db.select().from(schema.competencies);
  const coursesWithComps = new Set(existingComps.map((c) => c.courseId));

  const compInserts: (typeof schema.competencies.$inferInsert)[] = [];
  for (const course of courses) {
    if (coursesWithComps.has(course.id)) continue; // p.ej. el flagship ya tiene sus competencias
    const secs = (sectionsByCourse.get(course.id) ?? []).sort((a, b) => a.position - b.position);
    const prefix = slugPrefix(course.slug);
    secs.forEach((sec, i) => {
      compInserts.push({
        courseId: course.id,
        code: `${prefix}-C${i + 1}`,
        name: sec.title,
        description: `Competencia derivada de la sección "${sec.title}".`,
      });
    });
  }
  if (compInserts.length > 0) {
    await db.insert(schema.competencies).values(compInserts).onConflictDoNothing();
  }

  const allComps = await db.select().from(schema.competencies);
  const compsByCourse = new Map<string, typeof allComps>();
  for (const c of allComps) {
    const arr = compsByCourse.get(c.courseId) ?? [];
    arr.push(c);
    compsByCourse.set(c.courseId, arr);
  }

  /* ── 2. IRT + mapeo pregunta↔competencia sobre las 45 reales ── */
  console.info('  → IRT params + mapeo de las preguntas reales...');
  const irtInserts: (typeof schema.itemIrtParams.$inferInsert)[] = [];
  const qcInserts: (typeof schema.questionCompetencies.$inferInsert)[] = [];
  const now = new Date();

  // Preguntas que YA tienen mapeo (idempotencia: no re-mapear en re-corridas,
  // ni tocar los ítems sintéticos del banco flagship que se mapean aparte).
  const alreadyMapped = new Set(
    (
      await db
        .select({ q: schema.questionCompetencies.questionId })
        .from(schema.questionCompetencies)
    ).map((r) => r.q),
  );

  for (const course of courses) {
    const evalRow = evalByCourse.get(course.id);
    if (!evalRow) continue;
    const qs = (questionsByEval.get(evalRow.id) ?? []).sort((a, b) => a.position - b.position);
    const comps = compsByCourse.get(course.id) ?? [];
    if (comps.length === 0) continue;

    qs.forEach((q, i) => {
      if (alreadyMapped.has(q.id)) return;
      const p = irtForReal();
      irtInserts.push({ questionId: q.id, ...p, calibratedAt: now });
      // Round-robin: reparte las preguntas entre las competencias del curso.
      const comp = comps[i % comps.length]!;
      qcInserts.push({ questionId: q.id, competencyId: comp.id });
    });
  }
  if (irtInserts.length > 0) {
    await db.insert(schema.itemIrtParams).values(irtInserts).onConflictDoNothing();
  }
  if (qcInserts.length > 0) {
    await db.insert(schema.questionCompetencies).values(qcInserts).onConflictDoNothing();
  }

  /* ── 3. Banco flagship (Farmacología): +60 ítems calibrados ── */
  const flagship = courses.find((c) => c.slug === FLAGSHIP_SLUG);
  const flagshipEval = flagship ? evalByCourse.get(flagship.id) : undefined;
  const flagshipComps = flagship ? (compsByCourse.get(flagship.id) ?? []) : [];
  const flagshipExisting = flagshipEval ? (questionsByEval.get(flagshipEval.id) ?? []).length : 0;

  if (flagship && flagshipEval && flagshipComps.length > 0 && flagshipExisting <= 3) {
    console.info(
      `  → Banco flagship (Farmacología): +${FLAGSHIP_ITEMS_PER_COMPETENCY * flagshipComps.length} ítems...`,
    );
    let pos = flagshipExisting;
    const newQuestions: (typeof schema.evaluationQuestions.$inferInsert)[] = [];
    // meta paralelo: a qué competencia y con qué b va cada ítem generado.
    const meta: { competencyId: string; step: number }[] = [];

    flagshipComps.forEach((comp) => {
      for (let k = 0; k < FLAGSHIP_ITEMS_PER_COMPETENCY; k++) {
        pos++;
        const optBase = `${comp.code}-${k}`;
        newQuestions.push({
          evaluationId: flagshipEval.id,
          questionText: `[${comp.code}] Ítem calibrado ${k + 1}: ${comp.name}`,
          questionType: 'multiple_choice',
          options: [
            { id: `${optBase}-a`, text: 'Opción correcta', isCorrect: true },
            { id: `${optBase}-b`, text: 'Distractor 1', isCorrect: false },
            { id: `${optBase}-c`, text: 'Distractor 2', isCorrect: false },
            { id: `${optBase}-d`, text: 'Distractor 3', isCorrect: false },
          ],
          correctAnswer: null,
          points: '10',
          difficulty: 'adaptive',
          position: pos,
        });
        meta.push({ competencyId: comp.id, step: k });
      }
    });

    const inserted = await db.insert(schema.evaluationQuestions).values(newQuestions).returning();
    const bankIrt: (typeof schema.itemIrtParams.$inferInsert)[] = [];
    const bankQc: (typeof schema.questionCompetencies.$inferInsert)[] = [];
    inserted.forEach((q, idx) => {
      const m = meta[idx]!;
      bankIrt.push({
        questionId: q.id,
        ...irtForBank(m.step, FLAGSHIP_ITEMS_PER_COMPETENCY),
        calibratedAt: now,
      });
      bankQc.push({ questionId: q.id, competencyId: m.competencyId });
    });
    await db.insert(schema.itemIrtParams).values(bankIrt).onConflictDoNothing();
    await db.insert(schema.questionCompetencies).values(bankQc).onConflictDoNothing();
  } else {
    console.info('  → Banco flagship: ya expandido o sin competencias, se omite.');
  }

  /* ── 4. Progreso pre-cargado por estudiante ── */
  console.info('  → Progreso adaptativo de estudiantes (θ, mastery, BKT)...');
  const abilityInserts: (typeof schema.abilityEstimates.$inferInsert)[] = [];
  const progressInserts: (typeof schema.competencyProgress.$inferInsert)[] = [];
  const bktInserts: (typeof schema.bktStates.$inferInsert)[] = [];

  // Competencias en las que ya se generó estado por alumno (evita duplicados
  // cuando el alumno tiene varias inscripciones que comparten competencia).
  const seen = new Set<string>();
  const thetasByUser = new Map<string, number[]>();

  for (const en of enrollments) {
    const comps = compsByCourse.get(en.courseId) ?? [];
    for (const comp of comps) {
      const key = `${en.userId}:${comp.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Dominio latente ~ N(0.55, 0.25) recortado ⇒ mezcla de estados.
      // El golden demo usa un patrón determinista para garantizar la mezcla.
      const mastery =
        en.userId === goldenUserId
          ? GOLDEN_MASTERY[goldenCompSeq++ % GOLDEN_MASTERY.length]!
          : clamp(gaussian(0.55, 0.25), 0.05, 0.98);
      const theta = logit(mastery);
      const se = uniform(0.25, 0.5);

      progressInserts.push({
        userId: en.userId,
        competencyId: comp.id,
        mastery: mastery.toFixed(4),
        status: masteryStatus(mastery),
      });
      bktInserts.push({
        userId: en.userId,
        competencyId: comp.id,
        pKnow: mastery.toFixed(5),
        pTransit: BKT.pTransit.toFixed(5),
        pSlip: BKT.pSlip.toFixed(5),
        pGuess: BKT.pGuess.toFixed(5),
      });
      abilityInserts.push({
        userId: en.userId,
        competencyId: comp.id,
        scope: 'competency',
        theta: round4(theta),
        se: round4(se),
      });

      const arr = thetasByUser.get(en.userId) ?? [];
      arr.push(theta);
      thetasByUser.set(en.userId, arr);
    }
  }

  // θ global por alumno (media de sus θ por competencia).
  // El UNIQUE(userId, competencyId, scope) NO dedup-ea el scope global porque
  // competencyId es NULL (en Postgres NULL ≠ NULL) ⇒ se guarda manualmente.
  const globalUsers = new Set(
    (
      await db
        .select({ u: schema.abilityEstimates.userId })
        .from(schema.abilityEstimates)
        .where(eq(schema.abilityEstimates.scope, 'global'))
    ).map((r) => r.u),
  );
  for (const [userId, thetas] of thetasByUser) {
    if (globalUsers.has(userId)) continue;
    const g = thetas.reduce((s, x) => s + x, 0) / thetas.length;
    abilityInserts.push({
      userId,
      competencyId: null,
      scope: 'global',
      theta: round4(g),
      se: round4(uniform(0.2, 0.35)),
    });
  }

  if (progressInserts.length > 0) {
    await db.insert(schema.competencyProgress).values(progressInserts).onConflictDoNothing();
  }
  if (bktInserts.length > 0) {
    await db.insert(schema.bktStates).values(bktInserts).onConflictDoNothing();
  }
  if (abilityInserts.length > 0) {
    await db.insert(schema.abilityEstimates).values(abilityInserts).onConflictDoNothing();
  }

  /* ── Resumen ── */
  const [compCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.competencies);
  const [irtCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.itemIrtParams);
  const [qcCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.questionCompetencies);
  const [abCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.abilityEstimates);
  const [cpCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.competencyProgress);
  const [bktCount] = await db.select({ n: sql<number>`count(*)` }).from(schema.bktStates);

  // Tamaño del banco flagship (ítems calibrados de su evaluación).
  let flagshipBank = 0;
  if (flagshipEval) {
    const rows = await db
      .select({ id: schema.evaluationQuestions.id })
      .from(schema.evaluationQuestions)
      .innerJoin(
        schema.itemIrtParams,
        eq(schema.itemIrtParams.questionId, schema.evaluationQuestions.id),
      )
      .where(eq(schema.evaluationQuestions.evaluationId, flagshipEval.id));
    flagshipBank = rows.length;
  }

  console.info('\n✅ Seed adaptativo completado');
  console.info(`   • ${compCount!.n} competencias`);
  console.info(`   • ${irtCount!.n} ítems calibrados (item_irt_params)`);
  console.info(`   • ${qcCount!.n} mapeos pregunta↔competencia`);
  console.info(`   • banco flagship CSS: ${flagshipBank} ítems calibrados`);
  console.info(`   • ${abCount!.n} ability_estimates`);
  console.info(`   • ${cpCount!.n} competency_progress`);
  console.info(`   • ${bktCount!.n} bkt_states`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed adaptativo falló:', err);
  process.exit(1);
});
