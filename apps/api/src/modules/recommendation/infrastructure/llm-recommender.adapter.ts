import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExplainItem, RecommenderExplainerPort } from '../domain/ports/recommender-explainer.port';

// La inferencia local (Ollama) puede tardar decenas de segundos en la 1.ª llamada.
const DEFAULT_TIMEOUT_MS = 30000;
// Límite defensivo de longitud por justificación reescrita.
const MAX_REASON_LEN = 240;
// Ejemplo resuelto que se le muestra al modelo. Un modelo pequeño tiende a
// devolverlo tal cual, así que además de mostrarlo hay que RECHAZARLO en la
// respuesta: si no, acaba asignado a un curso al que no corresponde.
const FEW_SHOT_OUTPUT =
  'Aquí afianzarás el cálculo de dosis y las vías de administración, justo lo que hoy ' +
  'se te resiste al medicar.';

/**
 * Adaptador de EXPLICACIÓN de recomendaciones asistida por IA, contra una API
 * compatible con OpenAI (`/chat/completions`). Reutiliza las mismas variables
 * AI_BASE_URL / AI_API_KEY / AI_MODEL / AI_TIMEOUT_MS que el resto de la capa IA;
 * el flag propio `AI_RECOMMENDATION_ENABLED` la activa de forma independiente.
 *
 * Garantía de seguridad: NUNCA lanza. Devuelve `null` ante IA deshabilitada,
 * error de red, timeout o JSON inválido. El orquestador conserva entonces la
 * justificación DETERMINISTA. La IA jamás decide qué se recomienda ni el orden.
 */
@Injectable()
export class LlmRecommenderAdapter implements RecommenderExplainerPort {
  private readonly logger = new Logger(LlmRecommenderAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async explain(items: ExplainItem[]): Promise<Map<string, string> | null> {
    const enabled = this.config.get<boolean>('AI_RECOMMENDATION_ENABLED') ?? false;
    if (!enabled || items.length === 0) return null;

    const baseUrl = this.config.get<string>('AI_BASE_URL') ?? 'http://localhost:11434/v1';
    const apiKey = this.config.get<string>('AI_API_KEY') ?? 'ollama';
    const model = this.config.get<string>('AI_MODEL') ?? 'llama3.2:3b';
    const timeoutMs = this.config.get<number>('AI_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.6,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Eres un tutor académico que se dirige al estudiante en segunda ' +
                'persona. Para cada curso escribe UNA frase NUEVA, breve y motivadora ' +
                '(máx. 200 caracteres), que explique en qué le ayudará ese curso según ' +
                'las competencias que refuerza.\n' +
                // Sin esta prohibición explícita un modelo pequeño devuelve
                // `motivo_base` palabra por palabra: es la salida más probable y
                // parece que la IA no hubiera intervenido.
                'PROHIBIDO copiar o parafrasear literalmente "motivo_base": es solo el ' +
                'dato de partida, NO la respuesta. Si tu frase se parece a él, reescríbela.\n' +
                'No menciones porcentajes ni cifras. No inventes cursos ni competencias.\n' +
                'Ejemplo — entrada: curso="Farmacología", refuerza=Administración de ' +
                'medicamentos, motivo_base="Refuerza tu competencia «Administración de ' +
                `medicamentos» (desempeño actual 50%)". Salida esperada: "${FEW_SHOT_OUTPUT}"\n` +
                'Ese ejemplo es SOLO una muestra del estilo: no lo reutilices ni lo copies.\n' +
                'Responde SOLO un objeto JSON con la forma ' +
                '{"reasons":[{"courseId":"...","reason":"..."}]}.',
            },
            {
              role: 'user',
              content: this.buildUserPrompt(items),
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`IA recomendación: HTTP ${response.status}; se ignora (null).`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.parseReasons(content, items);
    } catch (err) {
      this.logger.warn(
        `IA recomendación deshabilitada por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private buildUserPrompt(items: ExplainItem[]): string {
    const lines = items.map((it) => {
      const comps =
        it.matchedCompetencies.length > 0
          ? it.matchedCompetencies.join(', ')
          : '(ninguna competencia débil específica)';
      return `- courseId=${it.courseId} | curso="${it.title}" | refuerza=${comps} | motivo_base="${it.baseReason}"`;
    });
    return (
      'Cursos a explicar:\n' +
      lines.join('\n') +
      '\nDevuelve SOLO el JSON {"reasons":[{"courseId","reason"}]}.'
    );
  }

  /**
   * Parsea el JSON del modelo y lo casa con los cursos reales por courseId.
   * Ignora entradas desconocidas o vacías; recorta a MAX_REASON_LEN.
   */
  private parseReasons(content: string, items: ExplainItem[]): Map<string, string> | null {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;

    const reasons = (raw as { reasons?: unknown }).reasons;
    if (!Array.isArray(reasons)) return null;

    const baseById = new Map(items.map((it) => [it.courseId, it.baseReason]));
    const out = new Map<string, string>();
    for (const entry of reasons) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const courseId = typeof obj.courseId === 'string' ? obj.courseId : null;
      const reason = typeof obj.reason === 'string' ? obj.reason.trim() : null;
      if (!courseId || !reason || !baseById.has(courseId)) continue;
      // Un modelo pequeño tiende a devolver `motivo_base` tal cual. Aceptarlo
      // sería anunciar una reescritura que no ocurrió: se descarta y el curso
      // conserva su justificación determinista, que es la misma frase pero sin
      // atribuírsela a la IA.
      if (isEchoOfBase(reason, baseById.get(courseId)!)) continue;
      // El modelo también copia el ejemplo del prompt, y entonces lo aplica a un
      // curso que nada tiene que ver. Se descarta igual que la copia del base.
      if (isEchoOfBase(reason, FEW_SHOT_OUTPUT)) continue;
      out.set(courseId, reason.slice(0, MAX_REASON_LEN));
    }
    return out.size > 0 ? out : null;
  }
}

/** Normaliza para comparar textos: sin acentos, signos ni dobles espacios. */
function normalizeForCompare(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿La "reescritura" es en realidad el motivo base? Compara por contención
 * mutua tras normalizar, de modo que también detecta la copia con la cifra o
 * la puntuación cambiadas, no solo la idéntica carácter a carácter.
 */
function isEchoOfBase(reason: string, baseReason: string): boolean {
  const a = normalizeForCompare(reason);
  const b = normalizeForCompare(baseReason);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
