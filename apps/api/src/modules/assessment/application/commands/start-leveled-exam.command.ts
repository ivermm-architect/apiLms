import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { toDifficulty, RecommendationType } from '../../domain/leveled/leveled-engine';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

/** Pregunta expuesta al estudiante (sin revelar qué opción es correcta). */
export interface LeveledQuestionView {
  id: string;
  questionText: string;
  questionType: string;
  options: Array<{ id: string; text: string }> | null;
}

/** Estado del examen leveled tras iniciar o responder. */
export interface LeveledStep {
  attemptId: string;
  finished: boolean;
  /** Porcentaje de aciertos al cerrar (null mientras está en curso). */
  score: number | null;
  isPassed: boolean | null;
  nextQuestion: LeveledQuestionView | null;
  recommendation: {
    type: RecommendationType;
    reason: string;
    claseId: string | null;
  } | null;
}

/** Proyecta una pregunta a la vista del estudiante ocultando `isCorrect`. */
export function toQuestionView(q: {
  id: string;
  questionText: string;
  questionType: string;
  options?: Array<{ id: string; text: string; isCorrect: boolean }> | null;
}): LeveledQuestionView {
  return {
    id: q.id,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options ? q.options.map((o) => ({ id: o.id, text: o.text })) : null,
  };
}

export class StartLeveledExamCommand implements ICommand {
  constructor(
    public readonly evaluationId: string,
    public readonly studentId: string,
    public readonly enrollmentId: string,
  ) {}
}

@CommandHandler(StartLeveledExamCommand)
export class StartLeveledExamHandler implements ICommandHandler<
  StartLeveledExamCommand,
  LeveledStep
> {
  constructor(private readonly repo: DrizzleEvaluationRepository) {}

  async execute(cmd: StartLeveledExamCommand): Promise<LeveledStep> {
    const evaluation = await this.repo.findById(cmd.evaluationId);
    if (!evaluation) throw new ConflictDomainException('Evaluación no existe');

    // Solo los intentos ENVIADOS cuentan para el límite (los abandonados no).
    const submitted = await this.repo.countSubmittedAttempts(cmd.evaluationId, cmd.studentId);
    if (submitted >= evaluation.maxAttempts) {
      throw new ConflictDomainException(
        `Has agotado los ${evaluation.maxAttempts} intentos permitidos`,
      );
    }

    // Reutiliza un intento abierto en vez de gastar otro.
    const open = await this.repo.findOpenAttempt(cmd.evaluationId, cmd.studentId);
    const attempt =
      open ??
      (await this.repo.createLeveledAttempt({
        evaluationId: cmd.evaluationId,
        studentId: cmd.studentId,
        enrollmentId: cmd.enrollmentId,
        attemptNumber: submitted + 1,
      }));

    const questions = await this.repo.listQuestions(cmd.evaluationId);
    const answeredIds = new Set((attempt.answers ?? []).map((a) => a.questionId));
    const remaining = questions.filter((q) => !answeredIds.has(q.id));
    // Nivel inicial 'medium'; si no hay de ese nivel, cae a la primera disponible.
    const first = remaining.find((q) => toDifficulty(q.difficulty) === 'medium') ?? remaining[0];

    return {
      attemptId: attempt.id,
      finished: false,
      score: null,
      isPassed: null,
      nextQuestion: first ? toQuestionView(first) : null,
      recommendation: null,
    };
  }
}
