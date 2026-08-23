// Puerto (hexagonal) para el INFORME DE APRENDIZAJE redactado por IA (tesis §2.9).
//
// La IA produce un resumen en LENGUAJE NATURAL de fortalezas y debilidades del
// estudiante a partir de sus datos REALES (calificaciones y avance), con
// recomendaciones de contenido. NO hay estimaciones psicométricas (θ, error
// estándar ni porcentajes de dominio calculados por TRI/BKT): solo hechos
// observados (promedios, progreso) y su lectura en prosa por el modelo.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve
// `null` ante IA deshabilitada, error, timeout o respuesta inválida. Con `null`,
// el informe simplemente NO se genera (la UI lo oculta) y el resto del sistema
// del estudiante funciona con normalidad.

/** Hechos observados por curso (deterministas, sin psicometría). */
export interface LearningCourseFact {
  /** Título del curso. */
  title: string;
  /** Avance del curso 0–100 (progreso de lecciones). */
  progress: number;
  /** Lecciones completadas y total. */
  lessonsCompleted: number;
  totalLessons: number;
  /** Promedio de calificaciones del curso en % (0–100), o null si aún no tiene. */
  averageScore: number | null;
  /** Número de calificaciones registradas en el curso. */
  gradeCount: number;
}

export interface LearningReportInput {
  courses: LearningCourseFact[];
}

/** Narración en lenguaje natural (sin cifras psicométricas). */
export interface LearningReportNarration {
  /** Resumen general breve (2–4 frases). */
  summary: string;
  /** Fortalezas observadas. */
  strengths: string[];
  /** Áreas a reforzar. */
  weaknesses: string[];
  /** Recomendaciones de contenido con su justificación en prosa. */
  recommendations: string[];
}

export interface LearningReportNarratorPort {
  /**
   * Redacta el informe en lenguaje natural a partir de los hechos del estudiante.
   * Devuelve `null` si la IA está deshabilitada o no puede responder con
   * garantías (degradación elegante: el informe se oculta).
   */
  narrate(input: LearningReportInput): Promise<LearningReportNarration | null>;
}

export const LEARNING_REPORT_NARRATOR = Symbol('LEARNING_REPORT_NARRATOR');
