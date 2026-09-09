import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplainItem } from '../domain/ports/recommender-explainer.port';

import { LlmRecommenderAdapter } from './llm-recommender.adapter';

const makeConfig = (values: Record<string, unknown>): ConfigService =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

const items: ExplainItem[] = [
  { courseId: 'c-1', title: 'Curso 1', matchedCompetencies: ['Álgebra'], baseReason: 'base 1' },
  { courseId: 'c-2', title: 'Curso 2', matchedCompetencies: [], baseReason: 'base 2' },
];

const mockChatResponse = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

describe('LlmRecommenderAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devuelve null si AI_RECOMMENDATION_ENABLED=false (sin llamar a la red)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new LlmRecommenderAdapter(makeConfig({ AI_RECOMMENDATION_ENABLED: false }));

    expect(await adapter.explain(items)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('devuelve null si la lista de items está vacía', async () => {
    const adapter = new LlmRecommenderAdapter(makeConfig({ AI_RECOMMENDATION_ENABLED: true }));
    expect(await adapter.explain([])).toBeNull();
  });

  describe('con IA habilitada', () => {
    const enabledAdapter = () =>
      new LlmRecommenderAdapter(
        makeConfig({
          AI_RECOMMENDATION_ENABLED: true,
          AI_BASE_URL: 'http://localhost:11434/v1',
          AI_API_KEY: 'ollama',
          AI_MODEL: 'llama3.2:3b',
          AI_TIMEOUT_MS: 5000,
        }),
      );

    it('parsea el JSON y casa las justificaciones por courseId', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse(
          JSON.stringify({
            reasons: [
              { courseId: 'c-1', reason: 'Refuerza tu álgebra ' },
              { courseId: 'c-2', reason: 'Muy recomendado' },
            ],
          }),
        ) as unknown as Response,
      );

      const out = await enabledAdapter().explain(items);
      expect(out).not.toBeNull();
      expect(out!.get('c-1')).toBe('Refuerza tu álgebra');
      expect(out!.get('c-2')).toBe('Muy recomendado');
    });

    it('descarta la justificación que solo repite el motivo base', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse(
          JSON.stringify({
            reasons: [
              // Devuelve el motivo base tal cual: no es una reescritura.
              { courseId: 'c-1', reason: 'base 1' },
              { courseId: 'c-2', reason: 'Ampliarás tu práctica clínica en planta' },
            ],
          }),
        ) as unknown as Response,
      );

      const out = await enabledAdapter().explain(items);
      expect(out!.has('c-1')).toBe(false);
      expect(out!.get('c-2')).toBe('Ampliarás tu práctica clínica en planta');
    });

    it('detecta la copia aunque cambien acentos, signos o mayúsculas', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ reasons: [{ courseId: 'c-1', reason: '¡BASE 1!' }] }),
        ) as unknown as Response,
      );

      // Sin coincidencias útiles se devuelve null y el orquestador conserva la
      // justificación determinista.
      expect(await enabledAdapter().explain(items)).toBeNull();
    });

    it('descarta la justificación que copia el ejemplo del prompt', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse(
          JSON.stringify({
            reasons: [
              {
                courseId: 'c-1',
                reason:
                  'Aquí afianzarás el cálculo de dosis y las vías de administración, justo lo ' +
                  'que hoy se te resiste al medicar.',
              },
            ],
          }),
        ) as unknown as Response,
      );

      // Es el ejemplo del system prompt: no describe al curso c-1 y acabaría
      // mostrándose como si fuera su justificación.
      expect(await enabledAdapter().explain(items)).toBeNull();
    });

    it('ignora courseId desconocidos y entradas vacías', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse(
          JSON.stringify({
            reasons: [
              { courseId: 'c-1', reason: 'ok' },
              { courseId: 'c-999', reason: 'curso inexistente' },
              { courseId: 'c-2', reason: '' },
            ],
          }),
        ) as unknown as Response,
      );

      const out = await enabledAdapter().explain(items);
      expect(out!.has('c-1')).toBe(true);
      expect(out!.has('c-999')).toBe(false);
      expect(out!.has('c-2')).toBe(false);
    });

    it('devuelve null ante JSON inválido', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockChatResponse('no soy json') as unknown as Response,
      );
      expect(await enabledAdapter().explain(items)).toBeNull();
    });

    it('devuelve null ante HTTP no-OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);
      expect(await enabledAdapter().explain(items)).toBeNull();
    });

    it('NUNCA lanza: ante error de red devuelve null', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await enabledAdapter().explain(items)).toBeNull();
    });
  });
});
