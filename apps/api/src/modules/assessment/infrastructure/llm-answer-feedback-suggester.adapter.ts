import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AnswerFeedbackSuggesterInput,
  AnswerFeedbackSuggesterPort,
} from '../domain/ports/answer-feedback-suggester.port';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_FEEDBACK_CHARS = 800;

/**
 * Adaptador de SUGERENCIA de retroalimentación contra una API compatible con
 * OpenAI (`/chat/completions`); sirve igual para Ollama local u OpenAI cambiando
 * solo AI_BASE_URL / AI_API_KEY / AI_MODEL.
 *
 * Garantía de degradación elegante: NUNCA lanza. Devuelve `null` ante IA
 * deshabilitada, error de red, timeout o respuesta vacía. El docente conserva
 * siempre la escritura manual de la retroalimentación.
 */
@Injectable()
export class LlmAnswerFeedbackSuggesterAdapter implements AnswerFeedbackSuggesterPort {
  private readonly logger = new Logger(LlmAnswerFeedbackSuggesterAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async suggestFeedback(input: AnswerFeedbackSuggesterInput): Promise<string | null> {
    const enabled = this.config.get<boolean>('AI_FEEDBACK_ENABLED') ?? false;
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
          temperature: 0.5,
          messages: [
            { role: 'system', content: this.systemPrompt() },
            { role: 'user', content: this.buildUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`IA feedback: HTTP ${response.status}; se ignora (null).`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      return content.slice(0, MAX_FEEDBACK_CHARS);
    } catch (err) {
      this.logger.warn(
        `IA feedback deshabilitada por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private systemPrompt(): string {
    return (
      'Eres un docente que redacta retroalimentación breve, constructiva y respetuosa ' +
      'en español (2 a 4 oraciones) dirigida al estudiante. Señalas aciertos y qué ' +
      'mejorar, sin revelar literalmente la respuesta esperada. Devuelves SOLO el texto ' +
      'de la retroalimentación, sin encabezados ni comillas.'
    );
  }

  private buildUserPrompt(input: AnswerFeedbackSuggesterInput): string {
    return [
      `Pregunta:\n${input.questionText}`.slice(0, 2000),
      `Respuesta del estudiante:\n${input.studentAnswer || '(respuesta vacía)'}`.slice(0, 3000),
      input.expectedAnswer
        ? `Respuesta esperada (referencia, no la cites literalmente):\n${input.expectedAnswer}`.slice(
            0,
            2000,
          )
        : 'No hay respuesta esperada de referencia.',
      'Redacta la retroalimentación para el estudiante.',
    ].join('\n\n');
  }
}
