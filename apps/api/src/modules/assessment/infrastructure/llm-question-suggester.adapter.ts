import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  QuestionSuggesterInput,
  QuestionSuggesterPort,
  SuggestedDifficulty,
  SuggestedOption,
  SuggestedQuestion,
  SuggestedQuestionType,
} from '../domain/ports/question-suggester.port';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_COUNT = 10;

/**
 * Adaptador de SUGERENCIA de preguntas contra una API compatible con OpenAI
 * (`/chat/completions`); sirve igual para Ollama local u OpenAI cambiando solo
 * AI_BASE_URL / AI_API_KEY / AI_MODEL.
 *
 * Garantía de degradación elegante: NUNCA lanza. Devuelve `[]` ante IA
 * deshabilitada, error de red, timeout o JSON inválido. El docente conserva
 * siempre el alta manual de preguntas.
 */
@Injectable()
export class LlmQuestionSuggesterAdapter implements QuestionSuggesterPort {
  private readonly logger = new Logger(LlmQuestionSuggesterAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async suggest(input: QuestionSuggesterInput): Promise<SuggestedQuestion[]> {
    const enabled = this.config.get<boolean>('AI_QUESTION_GEN_ENABLED') ?? false;
    if (!enabled) return [];

    const baseUrl = this.config.get<string>('AI_BASE_URL') ?? 'http://localhost:11434/v1';
    const apiKey = this.config.get<string>('AI_API_KEY') ?? 'ollama';
    const model = this.config.get<string>('AI_MODEL') ?? 'llama3.2:3b';
    const timeoutMs = this.config.get<number>('AI_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;
    const count = Math.max(1, Math.min(MAX_COUNT, Math.trunc(input.count)));

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this.systemPrompt() },
            { role: 'user', content: this.buildUserPrompt({ ...input, count }) },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`IA preguntas: HTTP ${response.status}; se ignora ([]).`);
        return [];
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return [];

      return this.parse(content, input.difficulty).slice(0, count);
    } catch (err) {
      this.logger.warn(
        `IA preguntas deshabilitada por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private systemPrompt(): string {
    return (
      'Eres un docente experto que redacta preguntas de evaluación claras y bien ' +
      'formuladas en español. Devuelves SOLO un objeto JSON con la clave "questions", ' +
      'un arreglo de preguntas. Cada pregunta tiene: ' +
      '"questionText" (string), "questionType" ("multiple_choice"|"true_false"|"open"), ' +
      '"options" (arreglo de {"text","isCorrect"}; 4 para opción múltiple con EXACTAMENTE ' +
      'una correcta, 2 para verdadero/falso, vacío para abierta), ' +
      '"correctAnswer" (string o null; respuesta esperada para abierta/verdadero-falso), ' +
      '"explanation" (string; por qué es correcta), ' +
      '"justification" (string; por qué esta pregunta evalúa bien el tema al nivel pedido). ' +
      'No incluyas texto fuera del JSON.'
    );
  }

  private buildUserPrompt(input: QuestionSuggesterInput): string {
    const level =
      input.difficulty === 'easy' ? 'fácil' : input.difficulty === 'hard' ? 'difícil' : 'medio';
    const typeLabel =
      input.questionType === 'multiple_choice'
        ? 'opción múltiple'
        : input.questionType === 'true_false'
          ? 'verdadero/falso'
          : 'respuesta abierta';
    return [
      `Tema/contenido base:\n${input.topic}`.slice(0, 6000),
      `Genera ${input.count} pregunta(s) de tipo "${input.questionType}" (${typeLabel}).`,
      `Nivel de dificultad: ${level}.`,
      'Devuelve SOLO el JSON con la clave "questions".',
    ].join('\n\n');
  }

  private parse(content: string, difficulty: SuggestedDifficulty): SuggestedQuestion[] {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return [];
    }
    const list = this.extractList(raw);
    const out: SuggestedQuestion[] = [];
    for (const item of list) {
      const q = this.parseOne(item, difficulty);
      if (q) out.push(q);
    }
    return out;
  }

  private extractList(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.questions)) return obj.questions;
      if (Array.isArray(obj.items)) return obj.items;
    }
    return [];
  }

  private parseOne(item: unknown, difficulty: SuggestedDifficulty): SuggestedQuestion | null {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;

    const questionText = typeof obj.questionText === 'string' ? obj.questionText.trim() : '';
    if (!questionText) return null;

    const questionType = this.normalizeType(obj.questionType);
    const options = this.parseOptions(obj.options, questionType);

    // Opción múltiple sin exactamente una correcta → se descarta (dato no confiable).
    if (questionType === 'multiple_choice') {
      const correct = options.filter((o) => o.isCorrect).length;
      if (options.length < 2 || correct !== 1) return null;
    }

    const correctAnswer =
      typeof obj.correctAnswer === 'string' && obj.correctAnswer.trim()
        ? obj.correctAnswer.trim()
        : null;
    const explanation =
      typeof obj.explanation === 'string' && obj.explanation.trim() ? obj.explanation.trim() : null;
    const justification =
      typeof obj.justification === 'string' && obj.justification.trim()
        ? obj.justification.trim()
        : 'Propuesta generada a partir del tema indicado.';

    return {
      questionText,
      questionType,
      options,
      correctAnswer,
      explanation,
      difficulty,
      justification,
    };
  }

  private normalizeType(value: unknown): SuggestedQuestionType {
    if (value === 'true_false' || value === 'open' || value === 'multiple_choice') return value;
    return 'multiple_choice';
  }

  private parseOptions(value: unknown, type: SuggestedQuestionType): SuggestedOption[] {
    if (type === 'open') return [];
    if (!Array.isArray(value)) return [];
    const out: SuggestedOption[] = [];
    for (const o of value) {
      if (!o || typeof o !== 'object') continue;
      const oo = o as Record<string, unknown>;
      const text = typeof oo.text === 'string' ? oo.text.trim() : '';
      if (!text) continue;
      out.push({ id: randomUUID(), text, isCorrect: Boolean(oo.isCorrect) });
    }
    return out;
  }
}
