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

      return this.parse(content, input.difficulty, input.questionType).slice(0, count);
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
    const typeRule =
      input.questionType === 'true_false'
        ? 'IMPORTANTE: "questionText" debe ser una AFIRMACIÓN declarativa sobre el tema (NO una pregunta; NO uses "¿" ni "?"). "correctAnswer" debe ser EXACTAMENTE "Verdadero" o "Falso" según si la afirmación es cierta. Deja "options" vacío. Incluye afirmaciones verdaderas y otras falsas.'
        : input.questionType === 'multiple_choice'
          ? '"options" DEBE tener 4 elementos con EXACTAMENTE uno isCorrect=true.'
          : 'Es respuesta abierta: "options" debe ir vacío y "correctAnswer" contiene la respuesta esperada.';
    return [
      `Tema/contenido base:\n${input.topic}`.slice(0, 6000),
      `Genera ${input.count} pregunta(s) de tipo "${input.questionType}" (${typeLabel}). TODAS deben ser de ese tipo.`,
      typeRule,
      `Nivel de dificultad: ${level}.`,
      'Devuelve SOLO el JSON con la clave "questions".',
    ].join('\n\n');
  }

  private parse(
    content: string,
    difficulty: SuggestedDifficulty,
    requestedType: SuggestedQuestionType,
  ): SuggestedQuestion[] {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return [];
    }
    const list = this.extractList(raw);
    const out: SuggestedQuestion[] = [];
    for (const item of list) {
      const q = this.parseOne(item, difficulty, requestedType);
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

  private parseOne(
    item: unknown,
    difficulty: SuggestedDifficulty,
    requestedType: SuggestedQuestionType,
  ): SuggestedQuestion | null {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;

    // Algunos modelos usan "statement" en vez de "questionText" (típico en V/F).
    const rawText = obj.questionText ?? obj.statement;
    const questionText = typeof rawText === 'string' ? rawText.trim() : '';
    if (!questionText) return null;

    // Respetamos SIEMPRE el tipo que pidió el docente; los modelos suelen
    // etiquetar mal (p. ej. devuelven opción múltiple rotulada como V/F).
    const questionType = requestedType;
    let options = this.parseOptions(obj.options, questionType);

    // "correctAnswer" o "answer" (variante que usan algunos modelos).
    const rawAnswer = obj.correctAnswer ?? obj.answer;
    const correctAnswer =
      typeof rawAnswer === 'string' && rawAnswer.trim() ? rawAnswer.trim() : null;

    // Opción múltiple: exige 4 opciones con exactamente una correcta.
    if (questionType === 'multiple_choice') {
      const correct = options.filter((o) => o.isCorrect).length;
      if (options.length < 2 || correct !== 1) return null;
    }

    // Verdadero/Falso: forzamos EXACTAMENTE 2 opciones (Verdadero/Falso).
    // Si no podemos determinar la respuesta, se descarta (evita el caso de una
    // pregunta de opción múltiple mal etiquetada como V/F).
    if (questionType === 'true_false') {
      const truthIsCorrect = this.resolveTrueFalse(options, correctAnswer);
      if (truthIsCorrect === null) return null;
      options = [
        { id: randomUUID(), text: 'Verdadero', isCorrect: truthIsCorrect },
        { id: randomUUID(), text: 'Falso', isCorrect: !truthIsCorrect },
      ];
    }

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
      correctAnswer: questionType === 'true_false' ? null : correctAnswer,
      explanation,
      difficulty,
      justification,
    };
  }

  /**
   * Deduce si la afirmación V/F es verdadera. Busca en `correctAnswer` y en el
   * texto de la opción marcada como correcta. Devuelve null si no se puede
   * determinar (la pregunta se descartará por no ser un V/F válido).
   */
  private resolveTrueFalse(
    options: SuggestedOption[],
    correctAnswer: string | null,
  ): boolean | null {
    const interpret = (raw: string): boolean | null => {
      const t = raw.trim().toLowerCase();
      if (/^(verdad|true|^v$|cierto|si|sí)/.test(t)) return true;
      if (/^(fals|false|^f$|no)/.test(t)) return false;
      return null;
    };
    if (correctAnswer) {
      const fromAnswer = interpret(correctAnswer);
      if (fromAnswer !== null) return fromAnswer;
    }
    const marked = options.find((o) => o.isCorrect);
    if (marked) {
      const fromOption = interpret(marked.text);
      if (fromOption !== null) return fromOption;
    }
    return null;
  }

  private parseOptions(value: unknown, type: SuggestedQuestionType): SuggestedOption[] {
    if (type === 'open') return [];
    if (!Array.isArray(value)) return [];
    const out: SuggestedOption[] = [];
    for (const o of value) {
      if (!o || typeof o !== 'object') continue;
      const oo = o as Record<string, unknown>;
      // Los modelos locales usan claves distintas para el texto de la opción
      // (text, optionText, option, label, value); aceptamos cualquiera.
      const rawText = oo.text ?? oo.optionText ?? oo.option ?? oo.label ?? oo.value;
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      if (!text) continue;
      const isCorrect = Boolean(oo.isCorrect ?? oo.correct ?? oo.is_correct);
      out.push({ id: randomUUID(), text, isCorrect });
    }
    return out;
  }
}
