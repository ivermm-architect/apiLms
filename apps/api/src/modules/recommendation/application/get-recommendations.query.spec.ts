import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecommenderExplainerPort } from '../domain/ports/recommender-explainer.port';
import { normalizeCompetencyKey } from '../domain/recommendation';
import { AiCacheService } from '../infrastructure/ai-cache.service';
import { DrizzleRecommendationRepository } from '../infrastructure/drizzle-recommendation.repository';

import { GetRecommendationsHandler, GetRecommendationsQuery } from './get-recommendations.query';

/** Deja correr la regeneración IA en segundo plano (fire-and-forget). */
const flush = () => new Promise((r) => setTimeout(r, 0));

const buildHandler = (opts: {
  weak?: Array<{ key: string; name: string; mastery: number }>;
  enrolled?: string[];
  candidates?: unknown[];
  aiReasons?: Map<string, string> | null;
}) => {
  const repo = {
    getWeakCompetencies: vi.fn().mockResolvedValue(opts.weak ?? []),
    getEnrolledCourseIds: vi.fn().mockResolvedValue(opts.enrolled ?? []),
    getCandidateCourses: vi.fn().mockResolvedValue(opts.candidates ?? []),
  } as unknown as DrizzleRecommendationRepository;

  const explainer = {
    explain: vi.fn().mockResolvedValue(opts.aiReasons ?? null),
  } as unknown as RecommenderExplainerPort;

  const cache = new AiCacheService();

  return { handler: new GetRecommendationsHandler(repo, explainer, cache), repo, explainer };
};

const candidate = (id: string, competencies: string[], totalStudents = 0) => ({
  courseId: id,
  slug: id,
  title: id,
  subtitle: null,
  coverUrl: null,
  level: 'beginner',
  totalStudents,
  competencies: competencies.map((name) => ({ key: normalizeCompetencyKey(name), name })),
});

describe('GetRecommendationsHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sirve el ranking determinista cuando la IA devuelve null (fallback)', async () => {
    const { handler, explainer } = buildHandler({
      weak: [{ key: normalizeCompetencyKey('Álgebra'), name: 'Álgebra', mastery: 0.3 }],
      candidates: [candidate('c-alg', ['Álgebra']), candidate('c-x', ['Otro'], 100)],
      aiReasons: null,
    });

    const out = await handler.execute(new GetRecommendationsQuery('u1', 5));

    expect(out[0]!.courseId).toBe('c-alg');
    expect(out[0]!.reason).toContain('Álgebra');
    expect(explainer.explain).toHaveBeenCalledOnce();
  });

  it('la IA reescribe la justificación en segundo plano, sin cambiar el orden', async () => {
    const { handler } = buildHandler({
      weak: [{ key: normalizeCompetencyKey('Álgebra'), name: 'Álgebra', mastery: 0.3 }],
      candidates: [candidate('c-alg', ['Álgebra']), candidate('c-x', ['Otro'], 100)],
      aiReasons: new Map([['c-alg', 'Justificación IA amigable']]),
    });

    // 1.ª carga: determinista al instante (la IA aún no terminó; no bloquea).
    const first = await handler.execute(new GetRecommendationsQuery('u1', 5));
    expect(first[0]!.courseId).toBe('c-alg');
    expect(first[0]!.reason).toContain('Álgebra');

    // La IA corre en segundo plano; esperamos a que rellene el caché.
    await flush();

    // 2.ª carga: ya con el texto de la IA cacheado, mismo orden.
    const second = await handler.execute(new GetRecommendationsQuery('u1', 5));
    expect(second[0]!.courseId).toBe('c-alg');
    expect(second[0]!.reason).toBe('Justificación IA amigable');
    // El curso sin override conserva su motivo determinista.
    expect(second[1]!.reason).toBe('Curso popular entre estudiantes');
  });

  it('excluye cursos ya inscritos vía repositorio', async () => {
    const { handler, repo } = buildHandler({ enrolled: ['c-enrolled'], candidates: [] });
    await handler.execute(new GetRecommendationsQuery('u1', 5));
    expect(repo.getCandidateCourses).toHaveBeenCalledWith(['c-enrolled']);
  });

  it('no llama a la IA si no hay recomendaciones', async () => {
    const { handler, explainer } = buildHandler({ candidates: [] });
    const out = await handler.execute(new GetRecommendationsQuery('u1', 5));
    expect(out).toEqual([]);
    expect(explainer.explain).not.toHaveBeenCalled();
  });
});
