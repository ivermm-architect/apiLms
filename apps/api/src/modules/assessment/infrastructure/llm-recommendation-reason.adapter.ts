import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RecommendationReasonInput, RecommendationReasonPort } from '../domain/leveled/ports';

// Timeout por defecto. La inferencia local (Ollama) puede tardar decenas de
// segundos, sobre todo en la 1.ª llamada (carga del modelo). Ajustable por env
// AI_TIMEOUT_MS. Para OpenAI un valor menor (~8s) es suficiente.
const DEFAULT_TIMEOUT_MS = 30000;
// Recorte defensivo de la redacción del modelo (una justificación, no un ensayo).
const MAX_REASON_LEN = 600;

/**
 * Adaptador de REDACCIÓN asistida por IA de la justificación (`reason`) de una
 * recomendación, contra una API compatible con OpenAI (`/chat/completions`).
 * Al ser OpenAI-compatible sirve tanto para Ollama local como para OpenAI:
 * cambiar de proveedor = cambiar solo AI_BASE_URL / AI_API_KEY / AI_MODEL.
 *
 * Garantía de seguridad: NUNCA lanza. Devuelve `null` ante IA deshabilitada,
 * error de red, timeout o respuesta inválida. La DECISIÓN refuerzo/avance es
 * determinista y ajena a este adaptador; con `null`, el caller usa el texto
 * base determinista (baseReason).
 */
@Injectable()
export class LlmRecommendationReasonAdapter implements RecommendationReasonPort {
  private readonly logger = new Logger(LlmRecommendationReasonAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async draftReason(input: RecommendationReasonInput): Promise<string | null> {
    // Flag maestro: si la IA está apagada, no se hace nada (degradación elegante).
    const enabled = this.config.get<boolean>('AI_RECOMMENDATION_ENABLED') ?? false;
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
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                'Eres un tutor académico. La DECISIÓN (reforzar o avanzar) ya está ' +
                'tomada por reglas; tu única tarea es REDACTAR una justificación breve ' +
                '(1-2 frases, español, tono cercano y motivador) para el estudiante. ' +
                'No cambies la decisión, no inventes cifras distintas a las dadas y ' +
                'responde SOLO con el texto de la justificación, sin comillas ni prefijos.',
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
        this.logger.warn(`IA reason: respuesta HTTP ${response.status}; se ignora (null).`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      return this.sanitize(content);
    } catch (err) {
      // Timeout, red caída, JSON de transporte inválido, etc. → nunca propaga.
      this.logger.warn(
        `IA reason deshabilitada por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private buildUserPrompt(input: RecommendationReasonInput): string {
    const decision =
      input.recommendationType === 'refuerzo'
        ? 'REFORZAR la clase (no alcanzó el umbral)'
        : 'AVANZAR a la siguiente clase (superó el umbral)';
    const parts = [
      `Decisión ya tomada: ${decision}.`,
      `Puntaje obtenido: ${input.score}% (umbral de aprobación: ${input.passingScore}%).`,
      `Nivel de la última pregunta: ${input.lastLevel}.`,
    ];
    if (input.evaluationTitle) parts.push(`Evaluación: ${input.evaluationTitle}.`);
    parts.push('Redacta SOLO la justificación para el estudiante.');
    return parts.join('\n');
  }

  /** Valida y normaliza la redacción del modelo. Vacío → null. */
  private sanitize(content: string | undefined | null): string | null {
    if (typeof content !== 'string') return null;
    const trimmed = content
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    if (trimmed.length === 0) return null;
    return trimmed.length > MAX_REASON_LEN ? trimmed.slice(0, MAX_REASON_LEN).trim() : trimmed;
  }
}
