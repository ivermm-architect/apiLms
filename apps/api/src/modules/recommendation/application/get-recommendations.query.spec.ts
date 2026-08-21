import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecommenderExplainerPort } from '../domain/ports/recommender-explainer.port';
import { normalizeCompetencyKey } from '../domain/recommendation';
import { DrizzleRecommendationRepository } from '../infrastructure/drizzle-recommendation.repository';

import { GetRecommendationsHandler, GetRecommendationsQuery } from './get-recommendations.query';

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

  return { handler: new GetRecommendationsHandler(repo, explainer), repo, explainer };
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

  it('la IA solo reescribe la justificación, no cambia el orden', async () => {
    const { handler } = buildHandler({
      weak: [{ key: normalizeCompetencyKey('Álgebra'), name: 'Álgebra', mastery: 0.3 }],
      candidates: [candidate('c-alg', ['Álgebra']), candidate('c-x', ['Otro'], 100)],
      aiReasons: new Map([['c-alg', 'Justificación IA amigable']]),
    });

    const out = await handler.execute(new GetRecommendationsQuery('u1', 5));

    expect(out[0]!.courseId).toBe('c-alg');
    expect(out[0]!.reason).toBe('Justificación IA amigable');
    // El curso sin override conserva su motivo determinista.
    expect(out[1]!.reason).toBe('Curso popular entre estudiantes');
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
