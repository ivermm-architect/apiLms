import { describe, expect, it, vi } from 'vitest';

import {
  ConflictDomainException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { buildRecommendation } from '../../domain/leveled/leveled-engine';
import { RecommendationReasonPort } from '../../domain/leveled/ports';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

import { StartLeveledExamCommand, StartLeveledExamHandler } from './start-leveled-exam.command';
import {
  SubmitLeveledAnswerCommand,
  SubmitLeveledAnswerHandler,
} from './submit-leveled-answer.command';

type Question = {
  id: string;
  difficulty: string;
  questionType: string;
  questionText: string;
  options?: Array<{ id: string; text: string; isCorrect: boolean }> | null;
};

const EVAL = {
  id: 'ev-1',
  passingScore: '60',
  courseId: 'course-1',
  lessonId: 'lesson-1',
  title: 'Álgebra básica',
  maxAttempts: 3,
};

function buildSubmit(opts: {
  attempt?: Record<string, unknown> | null;
  evaluation?: Record<string, unknown> | null;
  questions?: Question[];
  correct?: boolean;
  draftReason?: RecommendationReasonPort['draftReason'];
}) {
  const repo = {
    getAttempt: vi.fn().mockResolvedValue(
      opts.attempt ?? {
        id: 'att-1',
        studentId: 'stu-1',
        evaluationId: 'ev-1',
        status: 'in_progress',
        answers: [],
      },
    ),
    findById: vi.fn().mockResolvedValue(opts.evaluation ?? EVAL),
    listQuestions: vi.fn().mockResolvedValue(opts.questions ?? []),
    isCorrect: vi.fn().mockReturnValue(opts.correct ?? false),
    saveLeveledProgress: vi.fn().mockResolvedValue(undefined),
    closeLeveledAttempt: vi
      .fn()
      .mockImplementation(async (i: { attemptId: string }) => ({ id: i.attemptId })),
    insertRecommendation: vi.fn().mockResolvedValue({ id: 'rec-1' }),
  } as unknown as DrizzleEvaluationRepository;

  const reason = {
    draftReason: opts.draftReason ?? vi.fn().mockResolvedValue(null),
  } as unknown as RecommendationReasonPort;

  return { handler: new SubmitLeveledAnswerHandler(repo, reason), repo, reason };
}

const singleMedium: Question[] = [
  {
    id: 'q1',
    difficulty: 'medium',
    questionType: 'multiple_choice',
    questionText: '2+2?',
    options: [
      { id: 'a', text: '3', isCorrect: false },
      { id: 'b', text: '4', isCorrect: true },
    ],
  },
];

describe('SubmitLeveledAnswerHandler', () => {
  it('al cerrar reprobado genera recomendación de refuerzo con claseId y reason', async () => {
    const { handler, repo } = buildSubmit({ questions: singleMedium, correct: false });

    const step = await handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'stu-1'));

    expect(step.finished).toBe(true);
    expect(step.score).toBe(0);
    expect(step.isPassed).toBe(false);
    expect(step.recommendation?.type).toBe('refuerzo');
    expect(step.recommendation?.claseId).toBe('lesson-1');

    expect(repo.insertRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'stu-1',
        courseId: 'course-1',
        claseId: 'lesson-1',
        recommendationType: 'refuerzo',
      }),
    );
  });

  it('con IA apagada el reason es el texto determinista (baseReason)', async () => {
    const { handler, repo } = buildSubmit({ questions: singleMedium, correct: false });

    const step = await handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'stu-1'));

    const base = buildRecommendation({ score: 0, passingScore: 60, lastLevel: 'medium' });
    expect(step.recommendation?.reason).toBe(base.baseReason);
    // source_ai lo fija el repositorio por defecto ('openai-compatible'):
    // el command no envía un source distinto.
    const call = (repo.insertRecommendation as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(call?.sourceAi).toBeUndefined();
    expect(call?.reason).toBe(base.baseReason);
  });

  it('si la IA lanza, no rompe: usa el fallback determinista (tolerancia a fallos)', async () => {
    const draftReason = vi.fn().mockRejectedValue(new Error('proveedor caído'));
    const { handler } = buildSubmit({ questions: singleMedium, correct: false, draftReason });

    const step = await handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'stu-1'));

    const base = buildRecommendation({ score: 0, passingScore: 60, lastLevel: 'medium' });
    expect(draftReason).toHaveBeenCalled();
    expect(step.recommendation?.reason).toBe(base.baseReason);
  });

  it('si la IA redacta, usa el texto de la IA', async () => {
    const draftReason = vi.fn().mockResolvedValue('¡Vas muy bien, sigue así!');
    const { handler } = buildSubmit({ questions: singleMedium, correct: true, draftReason });

    const step = await handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'b', 'stu-1'));

    expect(step.recommendation?.reason).toBe('¡Vas muy bien, sigue así!');
  });

  it('continúa (no cierra) si quedan preguntas del nivel objetivo', async () => {
    const questions: Question[] = [
      ...singleMedium,
      { id: 'q2', difficulty: 'easy', questionType: 'true_false', questionText: 'V/F' },
    ];
    // Falla medium → objetivo 'easy' → hay q2 pendiente → siguiente pregunta.
    const { handler, repo } = buildSubmit({ questions, correct: false });

    const step = await handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'stu-1'));

    expect(step.finished).toBe(false);
    expect(step.nextQuestion?.id).toBe('q2');
    expect(repo.saveLeveledProgress).toHaveBeenCalled();
    expect(repo.insertRecommendation).not.toHaveBeenCalled();
  });

  it('rechaza responder un intento de otro estudiante (seguridad)', async () => {
    const { handler, repo } = buildSubmit({ questions: singleMedium });

    await expect(
      handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'atacante')),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(repo.insertRecommendation).not.toHaveBeenCalled();
  });

  it('rechaza si el intento ya fue enviado', async () => {
    const { handler } = buildSubmit({
      attempt: {
        id: 'att-1',
        studentId: 'stu-1',
        evaluationId: 'ev-1',
        status: 'submitted',
        answers: [],
      },
      questions: singleMedium,
    });

    await expect(
      handler.execute(new SubmitLeveledAnswerCommand('att-1', 'q1', 'a', 'stu-1')),
    ).rejects.toBeInstanceOf(ConflictDomainException);
  });
});

// El límite de intentos (attempt_number ≤ maxAttempts) vive en el inicio.
describe('StartLeveledExamHandler (límite de intentos)', () => {
  function buildStart(opts: { submitted: number; maxAttempts: number }) {
    const repo = {
      findById: vi.fn().mockResolvedValue({ id: 'ev-1', maxAttempts: opts.maxAttempts }),
      countSubmittedAttempts: vi.fn().mockResolvedValue(opts.submitted),
      findOpenAttempt: vi.fn().mockResolvedValue(null),
      createLeveledAttempt: vi.fn().mockImplementation(async (i: { attemptNumber: number }) => ({
        id: 'att-new',
        answers: [],
        attemptNumber: i.attemptNumber,
      })),
      listQuestions: vi.fn().mockResolvedValue(singleMedium),
    } as unknown as DrizzleEvaluationRepository;
    return { handler: new StartLeveledExamHandler(repo), repo };
  }

  it('rechaza cuando se agotaron los intentos (attempt_number no supera maxAttempts)', async () => {
    const { handler, repo } = buildStart({ submitted: 3, maxAttempts: 3 });
    await expect(
      handler.execute(new StartLeveledExamCommand('ev-1', 'stu-1', 'enr-1')),
    ).rejects.toBeInstanceOf(ConflictDomainException);
    expect(repo.createLeveledAttempt).not.toHaveBeenCalled();
  });

  it('crea el intento con attemptNumber = enviados + 1 y entrega una pregunta medium', async () => {
    const { handler, repo } = buildStart({ submitted: 1, maxAttempts: 3 });
    const step = await handler.execute(new StartLeveledExamCommand('ev-1', 'stu-1', 'enr-1'));

    expect(repo.createLeveledAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 2 }),
    );
    expect(step.nextQuestion?.id).toBe('q1');
    expect(step.finished).toBe(false);
  });
});
