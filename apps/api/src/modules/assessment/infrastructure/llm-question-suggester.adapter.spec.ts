import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestionSuggesterInput } from '../domain/ports/question-suggester.port';

import { LlmQuestionSuggesterAdapter } from './llm-question-suggester.adapter';

const makeConfig = (values: Record<string, unknown>): ConfigService =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const mockChatResponse = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

const INPUT: QuestionSuggesterInput = {
  topic: 'Valoración del paciente en enfermería',
  questionType: 'multiple_choice',
  difficulty: 'medium',
  count: 3,
};

const enabledAdapter = () =>
  new LlmQuestionSuggesterAdapter(
    makeConfig({
      AI_QUESTION_GEN_ENABLED: true,
      AI_BASE_URL: 'http://localhost:11434/v1',
      AI_API_KEY: 'ollama',
      AI_MODEL: 'llama3.2:3b',
      AI_TIMEOUT_MS: 5000,
    }),
  );

describe('LlmQuestionSuggesterAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devuelve [] si AI_QUESTION_GEN_ENABLED=false (sin llamar a la red)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new LlmQuestionSuggesterAdapter(makeConfig({ AI_QUESTION_GEN_ENABLED: false }));

    expect(await adapter.suggest(INPUT)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parsea preguntas válidas desde la clave "questions"', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(
        JSON.stringify({
          questions: [
            {
              questionText: '¿Cuál es el primer paso de la valoración?',
              questionType: 'multiple_choice',
              options: [
                { text: 'Anamnesis', isCorrect: true },
                { text: 'Alta', isCorrect: false },
                { text: 'Cirugía', isCorrect: false },
                { text: 'Reposo', isCorrect: false },
              ],
              explanation: 'La anamnesis inicia la valoración.',
              justification: 'Evalúa el orden del proceso.',
            },
          ],
        }),
      ) as unknown as Response,
    );

    const out = await enabledAdapter().suggest(INPUT);
    expect(out).toHaveLength(1);
    const q = out[0]!;
    expect(q.questionText).toContain('primer paso');
    expect(q.difficulty).toBe('medium');
    expect(q.options).toHaveLength(4);
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
    // Cada opción recibe un id generado.
    expect(q.options[0]!.id).toBeTruthy();
  });

  it('descarta opción múltiple sin exactamente una respuesta correcta', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(
        JSON.stringify({
          questions: [
            {
              questionText: 'Pregunta ambigua',
              questionType: 'multiple_choice',
              options: [
                { text: 'A', isCorrect: true },
                { text: 'B', isCorrect: true },
              ],
            },
          ],
        }),
      ) as unknown as Response,
    );

    expect(await enabledAdapter().suggest(INPUT)).toEqual([]);
  });

  it('descarta preguntas sin enunciado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(
        JSON.stringify({ questions: [{ questionText: '   ', questionType: 'open' }] }),
      ) as unknown as Response,
    );

    expect(await enabledAdapter().suggest(INPUT)).toEqual([]);
  });

  it('respeta el tope de count (recorta el excedente)', async () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({
      questionText: `Pregunta abierta ${i}`,
      questionType: 'open',
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(JSON.stringify({ questions })) as unknown as Response,
    );

    const out = await enabledAdapter().suggest({ ...INPUT, questionType: 'open', count: 2 });
    expect(out).toHaveLength(2);
    expect(out.every((q) => q.questionType === 'open')).toBe(true);
  });

  it('aplica justificación por defecto cuando la IA no la provee', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(
        JSON.stringify({
          questions: [
            {
              questionText: 'La higiene de manos es la medida más eficaz contra las IAAS.',
              questionType: 'true_false',
              // Sin `correctAnswer` el adaptador descarta la pregunta por no poder
              // resolver el V/F, y nunca se llegaría a evaluar la justificación.
              correctAnswer: 'Verdadero',
            },
          ],
        }),
      ) as unknown as Response,
    );

    const out = await enabledAdapter().suggest({ ...INPUT, questionType: 'true_false' });
    expect(out).toHaveLength(1);
    expect(out[0]!.justification).toBeTruthy();
  });

  it('descarta V/F cuya respuesta no puede determinarse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse(
        JSON.stringify({
          questions: [{ questionText: '¿Verdadero o falso?', questionType: 'true_false' }],
        }),
      ) as unknown as Response,
    );

    // Sin opciones ni respuesta no hay forma de saber si el enunciado es
    // verdadero o falso: se descarta en vez de proponer un ítem incalificable
    // (protege del caso de opción múltiple mal rotulada como V/F).
    expect(await enabledAdapter().suggest({ ...INPUT, questionType: 'true_false' })).toEqual([]);
  });

  it('devuelve [] ante JSON inválido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatResponse('no soy json') as unknown as Response,
    );
    expect(await enabledAdapter().suggest(INPUT)).toEqual([]);
  });

  it('devuelve [] ante HTTP no-OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);
    expect(await enabledAdapter().suggest(INPUT)).toEqual([]);
  });

  it('NUNCA lanza: ante error de red devuelve []', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await enabledAdapter().suggest(INPUT)).toEqual([]);
  });
});
