import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import {
  ConflictDomainException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import {
  buildRecommendation,
  computeScore,
  nextDifficulty,
  toDifficulty,
} from '../../domain/leveled/leveled-engine';
import { RECOMMENDATION_REASON, RecommendationReasonPort } from '../../domain/leveled/ports';
import {
  DrizzleEvaluationRepository,
  LeveledAnswer,
} from '../../infrastructure/drizzle-evaluation.repository';

import { toQuestionView, LeveledStep } from './start-leveled-exam.command';

export class SubmitLeveledAnswerCommand implements ICommand {
  constructor(
    public readonly attemptId: string,
    public readonly questionId: string,
    public readonly answer: string,
    /** user.sub del solicitante: se fuerza la propiedad del intento. */
    public readonly requesterId: string,
  ) {}
}

@CommandHandler(SubmitLeveledAnswerCommand)
export class SubmitLeveledAnswerHandler implements ICommandHandler<
  SubmitLeveledAnswerCommand,
  LeveledStep
> {
  constructor(
    private readonly repo: DrizzleEvaluationRepository,
    @Inject(RECOMMENDATION_REASON) private readonly reason: RecommendationReasonPort,
  ) {}

  async execute(cmd: SubmitLeveledAnswerCommand): Promise<LeveledStep> {
    const attempt = await this.repo.getAttempt(cmd.attemptId);
    if (!attempt) throw new ConflictDomainException('Intento no existe');

    // Propiedad: un estudiante sólo responde SU intento (nunca otro user_id).
    if (attempt.studentId !== cmd.requesterId) {
      throw new ForbiddenDomainException('No puedes responder un intento de otro estudiante');
    }
    if (attempt.status === 'submitted') {
      throw new ConflictDomainException('El intento ya fue enviado');
    }

    const evaluation = await this.repo.findById(attempt.evaluationId);
    if (!evaluation) throw new ConflictDomainException('Evaluación no existe');

    const questions = await this.repo.listQuestions(attempt.evaluationId);
    const question = questions.find((q) => q.id === cmd.questionId);
    if (!question) throw new ConflictDomainException('La pregunta no pertenece a la evaluación');

    const prior = attempt.answers ?? [];
    if (prior.some((a) => a.questionId === cmd.questionId)) {
      throw new ConflictDomainException('La pregunta ya fue respondida');
    }

    const currentLevel = toDifficulty(question.difficulty);
    const wasCorrect = this.repo.isCorrect(question, cmd.answer);
    const answers: LeveledAnswer[] = [
      ...prior,
      {
        questionId: cmd.questionId,
        answer: cmd.answer,
        isCorrect: wasCorrect,
        difficulty: currentLevel,
      },
    ];

    // Escalera determinista: siguiente nivel objetivo según acierto/fallo.
    const target = nextDifficulty(currentLevel, wasCorrect);
    const answeredIds = new Set(answers.map((a) => a.questionId));
    const nextQuestion = questions.find(
      (q) => !answeredIds.has(q.id) && toDifficulty(q.difficulty) === target,
    );

    // Quedan preguntas del nivel objetivo → continúa el intento.
    if (nextQuestion) {
      await this.repo.saveLeveledProgress(attempt.id, answers);
      return {
        attemptId: attempt.id,
        finished: false,
        score: null,
        isPassed: null,
        nextQuestion: toQuestionView(nextQuestion),
        recommendation: null,
      };
    }

    // No quedan preguntas del nivel objetivo → cierre + recomendación.
    const correct = answers.filter((a) => a.isCorrect).length;
    const total = answers.length;
    const score = computeScore(correct, total);
    const passingScore = Number(evaluation.passingScore);
    const isPassed = score >= passingScore;

    // DECISIÓN determinista (refuerzo/avance) + texto base de fallback.
    const decision = buildRecommendation({ score, passingScore, lastLevel: currentLevel });

    // IA OPCIONAL: sólo redacta el `reason`. Nunca rompe el flujo (fallback).
    let aiReason: string | null = null;
    try {
      aiReason = await this.reason.draftReason({
        recommendationType: decision.type,
        score,
        passingScore,
        lastLevel: currentLevel,
        evaluationTitle: evaluation.title,
      });
    } catch {
      aiReason = null;
    }
    const reason = aiReason ?? decision.baseReason;

    const updated = await this.repo.closeLeveledAttempt({
      attemptId: attempt.id,
      correct,
      total,
      percentage: score,
      isPassed,
      answers,
    });

    // La lección de refuerzo/avance es la lección asociada a la evaluación.
    const claseId = evaluation.lessonId ?? null;
    await this.repo.insertRecommendation({
      userId: attempt.studentId,
      courseId: evaluation.courseId,
      claseId,
      recommendationType: decision.type,
      reason,
    });

    return {
      attemptId: updated.id,
      finished: true,
      score,
      isPassed,
      nextQuestion: null,
      recommendation: { type: decision.type, reason, claseId },
    };
  }
}
