import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

/* ─────────────────────────────────────────────────────────────
   CIEBA LMS · Seed de validación de módulos
   Puebla las tablas que quedaban vacías tras seed + seed-adaptive,
   con datos DERIVADOS y coherentes para poder validar de punta a
   punta los módulos de evaluación, analítica, admin y competencias:

     Fase A · assessment
       · evaluation_attempts   (intentos por inscripción)
       · evaluation_answers    (respuesta por pregunta del intento)
       · grades                (calificaciones docente → estudiante)

     Fase B · analytics  (derivada de Fase A)
       · reports               (reporte académico por inscripción)
       · alerts                (riesgo académico: low_score / inactivity)

     Fase C · admin + competency
       · system_config         (parámetros base del sistema)
       · audit_logs            (bitácora retroactiva)
       · lesson_competencies   (mapeo lección ↔ competencia de su sección)

   Coherencia: la probabilidad de acierto y las notas se derivan de la
   habilidad latente del alumno (competency_progress del seed adaptativo).
   Idempotente: reejecutable sin duplicar.
   Debe correr DESPUÉS de: pnpm seed && pnpm seed:adaptive.
   ───────────────────────────────────────────────────────────── */

/* ─── RNG determinista (LCG + Box-Muller) ──────────────────── */

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const rng = makeRng(20260802);
const uniform = (lo: number, hi: number): number => lo + (hi - lo) * rng();
function gaussian(mean = 0, sd = 1): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * 86_400_000);

// Dificultad de la pregunta → parámetro b (TRI): fácil bajo, difícil alto.
const B_BY_DIFFICULTY: Record<string, number> = { easy: -1, medium: 0, hard: 1, adaptive: 0 };

// P(acierto) 2PL a partir de la habilidad del alumno y la dificultad del ítem.
function pCorrect(ability: number, difficulty: string): number {
  const theta = (ability - 0.5) * 4; // ability∈[0,1] → θ≈[-2,2]
  const b = B_BY_DIFFICULTY[difficulty] ?? 0;
  const a = 1.2;
  const p = 1 / (1 + Math.exp(-a * (theta - b)));
  return clamp(p, 0.05, 0.95);
}

// Riesgo por nota y por progreso; el riesgo final es el mayor de ambos.
const RISK_ORDER = ['low', 'medium', 'high', 'critical'] as const;
type Risk = (typeof RISK_ORDER)[number];
function scoreRisk(avg: number | null): Risk {
  if (avg == null) return 'low';
  if (avg < 40) return 'critical';
  if (avg < 60) return 'high';
  if (avg < 75) return 'medium';
  return 'low';
}
function progressRisk(progress: number): Risk {
  if (progress < 30) return 'high';
  if (progress < 50) return 'medium';
  return 'low';
}
const maxRisk = (a: Risk, b: Risk): Risk =>
  RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;

/* ─── Main ─────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms';
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.info('🧪 Seed de validación de módulos...');

  /* ── Cargar datos base ── */
  const courses = await db.select().from(schema.courses);
  const sections = await db.select().from(schema.sections);
  const lessons = await db.select().from(schema.lessons);
  const enrollments = await db.select().from(schema.enrollments);
  const evaluations = await db.select().from(schema.evaluations);
  const questions = await db.select().from(schema.evaluationQuestions);
  const competencies = await db.select().from(schema.competencies);
  const compProgress = await db.select().from(schema.competencyProgress);

  const courseById = new Map(courses.map((c) => [c.id, c]));

  const evalsByCourse = new Map<string, typeof evaluations>();
  for (const e of evaluations) {
    const arr = evalsByCourse.get(e.courseId) ?? [];
    arr.push(e);
    evalsByCourse.set(e.courseId, arr);
  }

  // Solo preguntas "reales" del quiz (excluye el banco flagship 'adaptive').
  const realQuestionsByEval = new Map<string, typeof questions>();
  for (const q of questions) {
    if (q.difficulty === 'adaptive') continue;
    const arr = realQuestionsByEval.get(q.evaluationId) ?? [];
    arr.push(q);
    realQuestionsByEval.set(q.evaluationId, arr);
  }

  const compsByCourse = new Map<string, typeof competencies>();
  for (const c of competencies) {
    const arr = compsByCourse.get(c.courseId) ?? [];
    arr.push(c);
    compsByCourse.set(c.courseId, arr);
  }

  // Habilidad latente del alumno por curso: media de mastery en las
  // competencias del curso; fallback a su media global; fallback gaussiano.
  const masteryByUserComp = new Map<string, number>();
  const masteryByUser = new Map<string, number[]>();
  for (const cp of compProgress) {
    const m = Number(cp.mastery);
    masteryByUserComp.set(`${cp.userId}:${cp.competencyId}`, m);
    const arr = masteryByUser.get(cp.userId) ?? [];
    arr.push(m);
    masteryByUser.set(cp.userId, arr);
  }
  const abilityCache = new Map<string, number>();
  function abilityFor(userId: string, courseId: string): number {
    const key = `${userId}:${courseId}`;
    const cached = abilityCache.get(key);
    if (cached != null) return cached;
    const comps = compsByCourse.get(courseId) ?? [];
    const present: number[] = [];
    for (const c of comps) {
      const m = masteryByUserComp.get(`${userId}:${c.id}`);
      if (m != null) present.push(m);
    }
    let ability: number;
    if (present.length > 0) {
      ability = present.reduce((s, x) => s + x, 0) / present.length;
    } else {
      const glob = masteryByUser.get(userId);
      ability = glob
        ? glob.reduce((s, x) => s + x, 0) / glob.length
        : clamp(gaussian(0.6, 0.18), 0.05, 0.95);
    }
    ability = clamp(ability, 0.05, 0.98);
    abilityCache.set(key, ability);
    return ability;
  }

  /* ═══════════════════════════════════════════════════════════
     FASE A · assessment (attempts / answers / grades)
     ═══════════════════════════════════════════════════════════ */
  console.info('  → Fase A: intentos, respuestas y calificaciones...');

  // Idempotencia: no regenerar intentos ya existentes por (alumno, evaluación).
  const existingAttempts = await db
    .select({ s: schema.evaluationAttempts.studentId, e: schema.evaluationAttempts.evaluationId })
    .from(schema.evaluationAttempts);
  const attemptSeen = new Set(existingAttempts.map((r) => `${r.s}:${r.e}`));

  // Idempotencia: no regenerar calificaciones si la inscripción ya tiene.
  const existingGrades = await db
    .select({ e: schema.grades.enrollmentId })
    .from(schema.grades);
  const gradedEnrollments = new Set(existingGrades.map((r) => r.e));

  const GRADE_TITLES = [
    'Trabajo práctico',
    'Examen parcial',
    'Informe de caso clínico',
    'Exposición oral',
    'Práctica de laboratorio',
  ] as const;

  let attemptsN = 0;
  let answersN = 0;
  let gradesN = 0;

  for (const en of enrollments) {
    const course = courseById.get(en.courseId);
    if (!course) continue;
    const ability = abilityFor(en.userId, en.courseId);
    const evals = evalsByCourse.get(en.courseId) ?? [];

    /* ── Intentos + respuestas ── */
    for (const ev of evals) {
      if (attemptSeen.has(`${en.userId}:${ev.id}`)) continue;
      const qs = (realQuestionsByEval.get(ev.id) ?? []).sort((a, b) => a.position - b.position);
      if (qs.length === 0) continue;

      const passing = Number(ev.passingScore);
      const maxAttempts = Math.max(1, ev.maxAttempts);
      let attemptNumber = 0;
      let passed = false;

      // Genera intentos hasta aprobar o agotar un tope aleatorio (1..2 típico).
      const plannedAttempts = rng() < 0.35 ? 2 : 1;
      const totalPlanned = Math.min(maxAttempts, plannedAttempts);

      while (attemptNumber < totalPlanned && !passed) {
        attemptNumber++;
        // Ligera mejora en reintentos (efecto aprendizaje).
        const effAbility = clamp(ability + (attemptNumber - 1) * 0.08, 0.05, 0.98);

        let score = 0;
        let maxScore = 0;
        const startedAt = daysAgo(uniform(3, 40));
        const timeSpent = Math.round(uniform(300, 1800));
        const submittedAt = new Date(startedAt.getTime() + timeSpent * 1000);

        const [attempt] = await db
          .insert(schema.evaluationAttempts)
          .values({
            evaluationId: ev.id,
            studentId: en.userId,
            enrollmentId: en.id,
            attemptNumber,
            score: '0',
            maxScore: '0',
            percentage: '0',
            isPassed: false,
            startedAt,
            submittedAt,
            timeSpentSeconds: timeSpent,
          })
          .returning();
        attemptsN++;

        const answerRows: (typeof schema.evaluationAnswers.$inferInsert)[] = [];
        for (const q of qs) {
          const pts = Number(q.points);
          maxScore += pts;
          const isCorrect = rng() < pCorrect(effAbility, q.difficulty);
          const earned = isCorrect ? pts : 0;
          score += earned;
          const chosen = q.options?.find((o) => o.isCorrect === isCorrect)?.id ?? null;
          answerRows.push({
            attemptId: attempt!.id,
            questionId: q.id,
            answer: chosen,
            isCorrect,
            pointsEarned: earned.toFixed(2),
          });
        }
        await db.insert(schema.evaluationAnswers).values(answerRows);
        answersN += answerRows.length;

        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        passed = percentage >= passing;
        await db
          .update(schema.evaluationAttempts)
          .set({
            score: score.toFixed(2),
            maxScore: maxScore.toFixed(2),
            percentage: percentage.toFixed(2),
            isPassed: passed,
          })
          .where(sql`${schema.evaluationAttempts.id} = ${attempt!.id}`);
      }
    }

    /* ── Calificaciones docente → estudiante ── */
    if (!gradedEnrollments.has(en.id)) {
      const nGrades = rng() < 0.5 ? 2 : 3;
      const chosen = [...GRADE_TITLES].sort(() => rng() - 0.5).slice(0, nGrades);
      const gradeRows: (typeof schema.grades.$inferInsert)[] = chosen.map((title, i) => {
        const raw = clamp(gaussian(ability * 100, 8), 0, 100);
        return {
          studentId: en.userId,
          teacherId: course.instructorId,
          courseId: en.courseId,
          lessonId: null,
          enrollmentId: en.id,
          title,
          score: raw.toFixed(2),
          maxScore: '100',
          weight: '1',
          feedback:
            raw >= 60
              ? 'Cumple con los objetivos de aprendizaje. Continúa reforzando la práctica clínica.'
              : 'Debe reforzar los conceptos base. Se recomienda tutoría de nivelación.',
          gradedAt: daysAgo(uniform(2, 35) + i),
        };
      });
      await db.insert(schema.grades).values(gradeRows);
      gradesN += gradeRows.length;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     FASE B · analytics (reports / alerts) — derivada de Fase A
     ═══════════════════════════════════════════════════════════ */
  console.info('  → Fase B: reportes y alertas de riesgo...');

  // Promedio real de porcentajes por inscripción (desde los intentos ya en BD).
  const attemptRows = await db
    .select({
      enrollmentId: schema.evaluationAttempts.enrollmentId,
      percentage: schema.evaluationAttempts.percentage,
    })
    .from(schema.evaluationAttempts);
  const pctByEnrollment = new Map<string, number[]>();
  for (const r of attemptRows) {
    if (r.percentage == null) continue;
    const arr = pctByEnrollment.get(r.enrollmentId) ?? [];
    arr.push(Number(r.percentage));
    pctByEnrollment.set(r.enrollmentId, arr);
  }

  // Idempotencia: una inscripción no se re-reporta ni se re-alerta.
  const reportedStudents = new Set(
    (await db.select({ s: schema.reports.studentId, c: schema.reports.courseId }).from(schema.reports)).map(
      (r) => `${r.s}:${r.c ?? ''}`,
    ),
  );
  const alertedKeys = new Set(
    (
      await db
        .select({
          s: schema.alerts.studentId,
          c: schema.alerts.courseId,
          t: schema.alerts.alertType,
        })
        .from(schema.alerts)
    ).map((r) => `${r.s}:${r.c ?? ''}:${r.t}`),
  );

  const reportRows: (typeof schema.reports.$inferInsert)[] = [];
  const alertRows: (typeof schema.alerts.$inferInsert)[] = [];
  const periodStart = daysAgo(30);
  const periodEnd = now;

  for (const en of enrollments) {
    const pcts = pctByEnrollment.get(en.id) ?? [];
    const avgScore = pcts.length > 0 ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null;
    const progress = Number(en.progressPercentage);
    const risk = maxRisk(scoreRisk(avgScore), progressRisk(progress));

    if (!reportedStudents.has(`${en.userId}:${en.courseId}`)) {
      reportRows.push({
        studentId: en.userId,
        courseId: en.courseId,
        periodStart,
        periodEnd,
        avgScore: avgScore != null ? avgScore.toFixed(2) : null,
        progressPercentage: progress.toFixed(2),
        lessonsCompleted: en.lessonsCompleted,
        totalLessons: en.totalLessons,
        riskLevel: risk,
        insights: {
          summary:
            risk === 'low'
              ? 'Rendimiento dentro de lo esperado.'
              : 'Requiere seguimiento académico.',
          avgScore: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          progress: Number(progress.toFixed(1)),
          recommendation:
            risk === 'low'
              ? 'Mantener el ritmo de estudio actual.'
              : 'Agendar tutoría y reforzar competencias con menor dominio.',
        },
        generatedAt: now,
      });
    }

    // Alerta por nota baja (riesgo medio+ por rendimiento).
    if (
      avgScore != null &&
      RISK_ORDER.indexOf(scoreRisk(avgScore)) >= RISK_ORDER.indexOf('medium') &&
      !alertedKeys.has(`${en.userId}:${en.courseId}:low_score`)
    ) {
      alertRows.push({
        studentId: en.userId,
        courseId: en.courseId,
        alertType: 'low_score',
        severity: scoreRisk(avgScore),
        message: `Promedio de ${avgScore.toFixed(0)}% en evaluaciones. Rendimiento por debajo del umbral esperado.`,
        metadata: { avgScore: Number(avgScore.toFixed(1)), threshold: 60 },
      });
    }

    // Alerta por inactividad / bajo avance (inscripción activa y sin completar).
    if (
      en.status === 'active' &&
      progress < 40 &&
      !alertedKeys.has(`${en.userId}:${en.courseId}:inactivity`)
    ) {
      alertRows.push({
        studentId: en.userId,
        courseId: en.courseId,
        alertType: 'inactivity',
        severity: progress < 20 ? 'high' : 'medium',
        message: `Avance del ${progress.toFixed(0)}% en el curso. Riesgo de rezago por baja actividad.`,
        metadata: { progress: Number(progress.toFixed(1)), lessonsCompleted: en.lessonsCompleted },
      });
    }
  }

  if (reportRows.length > 0) await db.insert(schema.reports).values(reportRows);
  if (alertRows.length > 0) await db.insert(schema.alerts).values(alertRows);

  /* ═══════════════════════════════════════════════════════════
     FASE C · admin (system_config / audit_logs) + competency
     ═══════════════════════════════════════════════════════════ */
  console.info('  → Fase C: configuración, auditoría y mapeo lección↔competencia...');

  /* ── system_config: parámetros base (idempotente por clave única) ── */
  const configRows: (typeof schema.systemConfig.$inferInsert)[] = [
    {
      key: 'institution.name',
      value: 'Centro de Instrucción y Enseñanza en Bioseguridad y Auxiliar en Enfermería',
      description: 'Nombre legal de la institución.',
    },
    { key: 'institution.acronym', value: 'CIEBA', description: 'Sigla institucional.' },
    {
      key: 'institution.location',
      value: { city: 'Oruro', country: 'Bolivia' },
      description: 'Ubicación de la sede.',
    },
    {
      key: 'grading.passing_score',
      value: 60,
      description: 'Nota mínima de aprobación (sobre 100).',
    },
    { key: 'grading.scale_max', value: 100, description: 'Escala máxima de calificación.' },
    {
      key: 'enrollment.default_duration_days',
      value: 365,
      description: 'Vigencia por defecto de una inscripción.',
    },
    {
      key: 'adaptive.cat',
      value: { minItems: 5, maxItems: 15, seTarget: 0.3 },
      description: 'Parámetros del test adaptativo (CAT).',
    },
    {
      key: 'adaptive.bkt',
      value: { pTransit: 0.2, pSlip: 0.1, pGuess: 0.2 },
      description: 'Parámetros por defecto de Bayesian Knowledge Tracing.',
    },
  ];
  await db.insert(schema.systemConfig).values(configRows).onConflictDoNothing();

  /* ── audit_logs: bitácora retroactiva (solo si está vacía) ── */
  const auditCountRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.auditLogs);
  const auditCount = Number(auditCountRows[0]?.n ?? 0);
  let auditN = 0;
  if (auditCount === 0) {
    const auditRows: (typeof schema.auditLogs.$inferInsert)[] = [];
    const ipFor = () =>
      `10.0.${Math.floor(uniform(0, 255))}.${Math.floor(uniform(1, 254))}`;
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
    for (const en of enrollments) {
      // Alta de inscripción.
      auditRows.push({
        userId: en.userId,
        action: 'create',
        entityType: 'enrollment',
        entityId: en.id,
        ipAddress: ipFor(),
        userAgent: ua,
        metadata: { courseId: en.courseId },
      });
      // Inicio de sesión ocasional.
      if (rng() < 0.7) {
        auditRows.push({
          userId: en.userId,
          action: 'login',
          entityType: 'user',
          entityId: en.userId,
          ipAddress: ipFor(),
          userAgent: ua,
          metadata: null,
        });
      }
    }
    if (auditRows.length > 0) {
      await db.insert(schema.auditLogs).values(auditRows);
      auditN = auditRows.length;
    }
  }

  /* ── lesson_competencies: mapea cada lección a la competencia de su sección ── */
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  // Índice (courseId, name) → competencia. En seed-adaptive name = título de sección.
  const compByCourseName = new Map<string, string>();
  for (const c of competencies) compByCourseName.set(`${c.courseId}:${c.name}`, c.id);

  const lcRows: (typeof schema.lessonCompetencies.$inferInsert)[] = [];
  for (const lesson of lessons) {
    const section = sectionById.get(lesson.sectionId);
    if (!section) continue;
    const competencyId = compByCourseName.get(`${lesson.courseId}:${section.title}`);
    if (!competencyId) continue;
    lcRows.push({ lessonId: lesson.id, competencyId });
  }
  if (lcRows.length > 0) {
    await db.insert(schema.lessonCompetencies).values(lcRows).onConflictDoNothing();
  }

  /* ── Resumen ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countRows = async (table: any): Promise<number> =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(table))[0]!.n);
  const [attTotal, ansTotal, grTotal, repTotal, alTotal, cfgTotal, audTotal, lcTotal] =
    await Promise.all([
      countRows(schema.evaluationAttempts),
      countRows(schema.evaluationAnswers),
      countRows(schema.grades),
      countRows(schema.reports),
      countRows(schema.alerts),
      countRows(schema.systemConfig),
      countRows(schema.auditLogs),
      countRows(schema.lessonCompetencies),
    ]);

  console.info('\n✅ Seed de validación completado');
  console.info(`   Fase A · +${attemptsN} intentos, +${answersN} respuestas, +${gradesN} notas`);
  console.info(`   Fase B · +${reportRows.length} reportes, +${alertRows.length} alertas`);
  console.info(`   Fase C · +${auditN} audit_logs, ${configRows.length} config keys, +${lcRows.length} lesson↔comp`);
  console.info('   ── Totales en BD ──');
  console.info(`   • evaluation_attempts: ${attTotal}`);
  console.info(`   • evaluation_answers:  ${ansTotal}`);
  console.info(`   • grades:              ${grTotal}`);
  console.info(`   • reports:             ${repTotal}`);
  console.info(`   • alerts:              ${alTotal}`);
  console.info(`   • system_config:       ${cfgTotal}`);
  console.info(`   • audit_logs:          ${audTotal}`);
  console.info(`   • lesson_competencies: ${lcTotal}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed de validación falló:', err);
  process.exit(1);
});
