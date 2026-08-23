// Núcleo DETERMINISTA y verificable del recomendador de contenido (HIST-7).
//
// Es la contraparte "canónica" del recomendador: dada la lista de competencias
// débiles del estudiante y los cursos candidatos, produce un ranking reproducible
// y una justificación en español SIN depender de ninguna IA. La IA (adaptador
// `RecommenderExplainerPort`) es una capa OPCIONAL por composición que solo
// reescribe la justificación en lenguaje natural; si está apagada o falla, este
// resultado determinista es el que se sirve tal cual.

/** Competencia en la que el estudiante tiene bajo dominio. */
export interface WeakCompetency {
  /** Clave normalizada (nombre/código) para emparejar entre cursos. */
  key: string;
  /** Nombre legible de la competencia. */
  name: string;
  /** Desempeño actual 0..1 derivado de calificaciones (menor = más débil). */
  mastery: number;
}

/** Curso candidato a recomendar (no inscrito por el estudiante). */
export interface CandidateCourse {
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  level: string;
  totalStudents: number;
  /** Competencias que desarrolla el curso, con su clave normalizada. */
  competencies: Array<{ key: string; name: string }>;
}

/** Recomendación puntuada, lista para presentar. */
export interface RankedRecommendation {
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  level: string;
  totalStudents: number;
  /** Relevancia = suma de déficits (1 - dominio) de las competencias emparejadas. */
  relevance: number;
  /** Nombres de competencias débiles que este curso refuerza. */
  matchedCompetencies: string[];
  /** Justificación determinista en español (fallback verificable). */
  reason: string;
}

/** Umbral de desempeño por debajo del cual una competencia se considera débil. */
export const WEAK_MASTERY_THRESHOLD = 0.6;

/** Normaliza un texto para emparejar competencias entre cursos distintos. */
export function normalizeCompetencyKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const pct = (mastery: number): number => Math.round(Math.max(0, Math.min(1, mastery)) * 100);

/**
 * Genera la justificación determinista para un curso según las competencias
 * débiles que refuerza. Con 0 coincidencias, cae a un motivo de popularidad.
 */
function buildReason(matched: WeakCompetency[]): string {
  if (matched.length === 0) return 'Curso popular entre estudiantes';

  // La competencia más débil de las emparejadas encabeza el motivo.
  const weakest = matched.reduce((a, b) => (b.mastery < a.mastery ? b : a));
  const base = `Refuerza tu competencia «${weakest.name}» (desempeño actual ${pct(weakest.mastery)}%)`;
  if (matched.length === 1) return base;
  const extra = matched.length - 1;
  return `${base} y ${extra} competencia${extra === 1 ? '' : 's'} más`;
}

/**
 * Ordena y puntúa cursos candidatos frente a las competencias débiles del
 * estudiante. Determinista: mismo input → mismo output (desempates estables).
 *
 * Criterio de orden:
 *  1) relevancia (suma de déficits de competencias emparejadas) desc
 *  2) popularidad (totalStudents) desc
 *  3) título asc (desempate estable y reproducible)
 */
export function rankRecommendations(
  weak: WeakCompetency[],
  candidates: CandidateCourse[],
  limit: number,
): RankedRecommendation[] {
  // Índice de competencias débiles por clave (se queda con la más débil si hay
  // duplicados de la misma competencia en varios cursos inscritos).
  const weakByKey = new Map<string, WeakCompetency>();
  for (const w of weak) {
    const existing = weakByKey.get(w.key);
    if (!existing || w.mastery < existing.mastery) weakByKey.set(w.key, w);
  }

  const ranked: RankedRecommendation[] = candidates.map((course) => {
    // Empareja por clave normalizada, deduplicando por competencia débil.
    const matchedByKey = new Map<string, WeakCompetency>();
    for (const c of course.competencies) {
      const w = weakByKey.get(c.key);
      if (w) matchedByKey.set(w.key, w);
    }
    const matched = [...matchedByKey.values()];
    const relevance = matched.reduce((sum, w) => sum + (1 - w.mastery), 0);

    return {
      courseId: course.courseId,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      coverUrl: course.coverUrl,
      level: course.level,
      totalStudents: course.totalStudents,
      relevance,
      matchedCompetencies: matched.map((w) => w.name),
      reason: buildReason(matched),
    };
  });

  ranked.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.totalStudents !== a.totalStudents) return b.totalStudents - a.totalStudents;
    return a.title.localeCompare(b.title);
  });

  return ranked.slice(0, Math.max(0, limit));
}
