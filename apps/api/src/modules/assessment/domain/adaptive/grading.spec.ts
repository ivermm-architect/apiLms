import { describe, expect, it } from 'vitest';

import { masteryStatus, scoreAnswer, thetaToMastery } from './grading';

describe('scoreAnswer', () => {
  const mc = {
    questionType: 'multiple_choice',
    options: [
      { id: 'o1', text: 'A', isCorrect: false },
      { id: 'o2', text: 'B', isCorrect: true },
    ],
  };

  it('acierta la opción correcta en multiple_choice', () => {
    expect(scoreAnswer(mc, 'o2')).toBe(true);
    expect(scoreAnswer(mc, 'o1')).toBe(false);
  });

  it('compara contra correctAnswer sin distinción de caso/espacios', () => {
    const q = { questionType: 'fill_blank', correctAnswer: 'París' };
    expect(scoreAnswer(q, '  parís ')).toBe(true);
    expect(scoreAnswer(q, 'londres')).toBe(false);
  });

  it('las preguntas abiertas nunca se autocalifican', () => {
    expect(scoreAnswer({ questionType: 'open', correctAnswer: 'x' }, 'x')).toBe(false);
  });
});

describe('thetaToMastery', () => {
  it('θ=0 => 0.5', () => {
    expect(thetaToMastery(0)).toBeCloseTo(0.5, 10);
  });

  it('es monótona creciente', () => {
    expect(thetaToMastery(-2)).toBeLessThan(thetaToMastery(2));
  });
});

describe('masteryStatus', () => {
  it('clasifica dominio, progreso y riesgo', () => {
    expect(masteryStatus(0.9)).toBe('dominada');
    expect(masteryStatus(0.5)).toBe('en_progreso');
    expect(masteryStatus(0.2)).toBe('en_riesgo');
  });
});
