import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExplainItem, RecommenderExplainerPort } from '../domain/ports/recommender-explainer.port';

// Mismo timeout por defecto que el adaptador de priors IRT: la inferencia local
// (Ollama) puede tardar decenas de segundos en la 1.ª llamada.
const DEFAULT_TIMEOUT_MS = 30000;
// Límite defensivo de longitud por justificación reescrita.
const MAX_REASON_LEN = 240;

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
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Eres un tutor académico. Reescribe en español, de forma breve y ' +
                'motivadora (máx. 200 caracteres), el motivo por el que se recomienda ' +
                'cada curso a un estudiante, a partir de las competencias que refuerza. ' +
                'NO inventes cursos ni competencias. Responde SOLO un objeto JSON con la ' +
                'forma {"reasons":[{"courseId":"...","reason":"..."}]}.',
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

    const validIds = new Set(items.map((it) => it.courseId));
    const out = new Map<string, string>();
    for (const entry of reasons) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const courseId = typeof obj.courseId === 'string' ? obj.courseId : null;
      const reason = typeof obj.reason === 'string' ? obj.reason.trim() : null;
      if (!courseId || !reason || !validIds.has(courseId)) continue;
      out.set(courseId, reason.slice(0, MAX_REASON_LEN));
    }
    return out.size > 0 ? out : null;
  }
}
