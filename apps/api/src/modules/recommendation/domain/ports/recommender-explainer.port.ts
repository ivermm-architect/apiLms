// Puerto (hexagonal) para la EXPLICACIÓN ASISTIDA POR IA de recomendaciones.
//
// Capa OPCIONAL y NO CANÓNICA: NO decide qué cursos se recomiendan ni en qué
// orden (eso lo hace el ranker determinista `rankRecommendations`). La IA solo
// reescribe la justificación de cada curso ya seleccionado en lenguaje natural,
// más cercano y motivador para el estudiante.
//
// Contrato de degradación elegante: la implementación NUNCA lanza; devuelve
// `null` ante IA deshabilitada, error, timeout o respuesta inválida. Con `null`,
// el orquestador conserva la justificación determinista (fallback verificable).

export interface ExplainItem {
  /** Id del curso (clave para casar la respuesta con la recomendación). */
  courseId: string;
  /** Título del curso, como contexto para el modelo. */
  title: string;
  /** Competencias débiles que el curso refuerza (puede estar vacío). */
  matchedCompetencies: string[];
  /** Justificación determinista de referencia (el modelo la mejora, no la contradice). */
  baseReason: string;
}

export interface RecommenderExplainerPort {
  /**
   * Reescribe las justificaciones en lenguaje natural. Devuelve un mapa
   * courseId → justificación, o `null` si la IA está deshabilitada o no puede
   * responder con garantías. Puede omitir cursos: los ausentes conservan su
   * justificación determinista.
   */
  explain(items: ExplainItem[]): Promise<Map<string, string> | null>;
}

export const RECOMMENDER_EXPLAINER = Symbol('RECOMMENDER_EXPLAINER');
