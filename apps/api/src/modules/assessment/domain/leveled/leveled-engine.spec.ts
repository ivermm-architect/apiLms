import { describe, expect, it } from 'vitest';

import { buildRecommendation, computeScore, nextDifficulty, toDifficulty } from './leveled-engine';

// ISO/IEC 25010 — Funcionalidad (completitud + corrección funcional).
describe('leveled-engine', () => {
  describe('nextDifficulty', () => {
    it('sube un peldaño al acertar', () => {
      expect(nextDifficulty('easy', true)).toBe('medium');
      expect(nextDifficulty('medium', true)).toBe('hard');
    });

    it('baja un peldaño al fallar', () => {
      expect(nextDifficulty('hard', false)).toBe('medium');
      expect(nextDifficulty('medium', false)).toBe('easy');
    });

    it('respeta el tope superior (hard) al acertar', () => {
      expect(nextDifficulty('hard', true)).toBe('hard');
    });

    it('respeta el piso inferior (easy) al fallar', () => {
      expect(nextDifficulty('easy', false)).toBe('easy');
    });
  });

  describe('computeScore', () => {
    it('devuelve 0 sin aciertos', () => {
      expect(computeScore(0, 4)).toBe(0);
    });

    it('devuelve 100 con todo correcto', () => {
      expect(computeScore(4, 4)).toBe(100);
    });

    it('calcula el porcentaje parcial y redondea', () => {
      expect(computeScore(2, 3)).toBe(67); // 66.67 → 67
      expect(computeScore(1, 3)).toBe(33); // 33.33 → 33
    });

    it('devuelve 0 cuando total = 0 (sin división por cero)', () => {
      expect(computeScore(0, 0)).toBe(0);
    });
  });

  describe('buildRecommendation', () => {
    it("score < passingScore ⇒ 'refuerzo'", () => {
      const rec = buildRecommendation({ score: 40, passingScore: 60, lastLevel: 'easy' });
      expect(rec.type).toBe('refuerzo');
      expect(rec.baseReason).toContain('40%');
      expect(rec.baseReason).toContain('easy');
    });

    it("límite exacto score == passingScore ⇒ 'avance'", () => {
      const rec = buildRecommendation({ score: 60, passingScore: 60, lastLevel: 'hard' });
      expect(rec.type).toBe('avance');
    });

    it("score > passingScore ⇒ 'avance'", () => {
      const rec = buildRecommendation({ score: 90, passingScore: 60, lastLevel: 'hard' });
      expect(rec.type).toBe('avance');
    });
  });

  describe('toDifficulty', () => {
    it('mapea valores válidos', () => {
      expect(toDifficulty('easy')).toBe('easy');
      expect(toDifficulty('hard')).toBe('hard');
    });

    it("normaliza 'adaptive'/null/desconocido a 'medium'", () => {
      expect(toDifficulty('adaptive')).toBe('medium');
      expect(toDifficulty(null)).toBe('medium');
      expect(toDifficulty(undefined)).toBe('medium');
      expect(toDifficulty('otro')).toBe('medium');
    });
  });
});
