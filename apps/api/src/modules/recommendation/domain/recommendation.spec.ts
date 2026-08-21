import { describe, expect, it } from 'vitest';

import {
  CandidateCourse,
  normalizeCompetencyKey,
  rankRecommendations,
  WeakCompetency,
} from './recommendation';

const course = (
  id: string,
  title: string,
  totalStudents: number,
  competencies: string[],
): CandidateCourse => ({
  courseId: id,
  slug: id,
  title,
  subtitle: null,
  coverUrl: null,
  level: 'beginner',
  totalStudents,
  competencies: competencies.map((name) => ({ key: normalizeCompetencyKey(name), name })),
});

describe('normalizeCompetencyKey', () => {
  it('quita acentos, pasa a minúsculas y colapsa espacios', () => {
    expect(normalizeCompetencyKey('  Álgebra   Lineal ')).toBe('algebra lineal');
    expect(normalizeCompetencyKey('Álgebra Lineal')).toBe(normalizeCompetencyKey('algebra lineal'));
  });
});

describe('rankRecommendations', () => {
  const weak: WeakCompetency[] = [
    { key: normalizeCompetencyKey('Álgebra Lineal'), name: 'Álgebra Lineal', mastery: 0.2 },
    { key: normalizeCompetencyKey('Cálculo'), name: 'Cálculo', mastery: 0.5 },
  ];

  it('prioriza cursos que refuerzan las competencias más débiles', () => {
    const candidates = [
      course('c-pop', 'Curso Popular', 1000, ['Historia']), // sin match, muy popular
      course('c-alg', 'Curso Álgebra', 10, ['Álgebra Lineal']), // match fuerte (déficit 0.8)
      course('c-cal', 'Curso Cálculo', 10, ['Cálculo']), // match medio (déficit 0.5)
    ];
    const out = rankRecommendations(weak, candidates, 3);
    expect(out.map((r) => r.courseId)).toEqual(['c-alg', 'c-cal', 'c-pop']);
    expect(out[0]!.relevance).toBeCloseTo(0.8, 10);
    expect(out[0]!.matchedCompetencies).toEqual(['Álgebra Lineal']);
  });

  it('la relevancia suma los déficits de todas las competencias emparejadas', () => {
    const candidates = [course('c-both', 'Ambas', 5, ['Álgebra Lineal', 'Cálculo'])];
    const out = rankRecommendations(weak, candidates, 5);
    // (1-0.2) + (1-0.5) = 1.3
    expect(out[0]!.relevance).toBeCloseTo(1.3, 10);
    expect(out[0]!.matchedCompetencies).toHaveLength(2);
  });

  it('desempata por popularidad y luego por título (determinista)', () => {
    const candidates = [
      course('c-b', 'B sin match', 50, ['X']),
      course('c-a', 'A sin match', 50, ['Y']),
      course('c-c', 'C sin match', 90, ['Z']),
    ];
    const out = rankRecommendations([], candidates, 3);
    // relevancia 0 en todos → popularidad desc, luego título asc
    expect(out.map((r) => r.courseId)).toEqual(['c-c', 'c-a', 'c-b']);
  });

  it('es reproducible: mismo input → mismo output', () => {
    const candidates = [
      course('c-alg', 'Curso Álgebra', 10, ['Álgebra Lineal']),
      course('c-cal', 'Curso Cálculo', 10, ['Cálculo']),
    ];
    const a = rankRecommendations(weak, candidates, 5);
    const b = rankRecommendations(weak, candidates, 5);
    expect(a).toEqual(b);
  });

  it('respeta el límite', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      course(`c-${i}`, `Curso ${i}`, i, ['Álgebra Lineal']),
    );
    expect(rankRecommendations(weak, candidates, 3)).toHaveLength(3);
  });

  it('sin competencias débiles genera motivo de popularidad', () => {
    const candidates = [course('c-1', 'Curso 1', 100, ['Álgebra Lineal'])];
    const out = rankRecommendations([], candidates, 5);
    expect(out[0]!.reason).toBe('Curso popular entre estudiantes');
    expect(out[0]!.matchedCompetencies).toEqual([]);
  });

  it('el motivo cita la competencia más débil emparejada y su dominio', () => {
    const candidates = [course('c-1', 'Curso 1', 100, ['Álgebra Lineal', 'Cálculo'])];
    const out = rankRecommendations(weak, candidates, 5);
    expect(out[0]!.reason).toContain('Álgebra Lineal');
    expect(out[0]!.reason).toContain('20%');
    expect(out[0]!.reason).toContain('1 competencia más');
  });
});
