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
