import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ItemPriorEstimate,
  ItemPriorInput,
  ItemPriorPort,
} from '../domain/ports/item-prior.port';

// Rangos válidos del modelo TRI 2PL (espejo de calibration.ts).
const A_MIN = 0.2;
const A_MAX = 3;
const B_MIN = -4;
const B_MAX = 4;
// Timeout por defecto. La inferencia local (Ollama) puede tardar decenas de
// segundos, sobre todo en la 1.ª llamada (carga del modelo en memoria). Se puede
// ajustar por env AI_TIMEOUT_MS. Para OpenAI un valor menor (~8s) es suficiente.
const DEFAULT_TIMEOUT_MS = 30000;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * Adaptador ÚNICO de inicialización asistida por IA, contra una API compatible
 * con OpenAI (`/chat/completions`). Al ser OpenAI-compatible sirve tanto para
 * Ollama local como para OpenAI: cambiar de proveedor = cambiar solo
 * AI_BASE_URL / AI_API_KEY / AI_MODEL, sin tocar código.
 *
 * Garantía de seguridad: NUNCA lanza. Devuelve `null` ante IA deshabilitada,
 * error de red, timeout, JSON inválido o valores fuera de rango. El motor
 * canónico se comporta idéntico cuando este adaptador devuelve `null`.
 */
@Injectable()
export class LlmItemPriorAdapter implements ItemPriorPort {
  private readonly logger = new Logger(LlmItemPriorAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async estimatePriors(input: ItemPriorInput): Promise<ItemPriorEstimate | null> {
    // Flag maestro: si la IA está apagada, no se hace nada (degradación elegante).
    const enabled = this.config.get<boolean>('AI_CALIBRATION_ENABLED') ?? false;
    if (!enabled) return null;

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
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Eres un psicómetra experto en Teoría de Respuesta al Ítem (TRI/IRT). ' +
                'Estimas parámetros SEMILLA del modelo 2PL para un ítem a partir de su ' +
                'enunciado, cuando aún no hay datos de respuestas. Responde SOLO un objeto ' +
                'JSON con las claves numéricas {"a","b","confidence"}. ' +
                `"b" es la dificultad en [${B_MIN}, ${B_MAX}] (mayor = más difícil). ` +
                `"a" es la discriminación en [${A_MIN}, ${A_MAX}]. ` +
                '"confidence" es tu confianza en [0, 1]. Sin texto adicional.',
            },
            {
              role: 'user',
              content: this.buildUserPrompt(input),
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`IA priors: respuesta HTTP ${response.status}; se ignora (null).`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.parseEstimate(content);
    } catch (err) {
      // Timeout, red caída, JSON de transporte inválido, etc. → nunca propaga.
      this.logger.warn(
        `IA priors deshabilitada por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private buildUserPrompt(input: ItemPriorInput): string {
    const parts = [`Enunciado del ítem: ${input.statement}`];
    if (input.options && input.options.length > 0) {
      parts.push(`Opciones: ${input.options.map((o, i) => `${i + 1}) ${o}`).join(' | ')}`);
    }
    if (input.competency) {
      parts.push(`Competencia evaluada: ${input.competency}`);
    }
    parts.push('Devuelve SOLO el JSON {"a","b","confidence"}.');
    return parts.join('\n');
  }

  /** Parsea y valida el JSON del modelo. Fuera de rango o no numérico → null. */
  private parseEstimate(content: string): ItemPriorEstimate | null {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;

    const obj = raw as Record<string, unknown>;
    const a = Number(obj.a);
    const b = Number(obj.b);
    const confidenceRaw = Number(obj.confidence);

    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 1) : 0;
    return {
      a: clamp(a, A_MIN, A_MAX),
      b: clamp(b, B_MIN, B_MAX),
      confidence,
    };
  }
}
