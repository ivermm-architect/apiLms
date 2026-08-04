import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { EntityNotFoundException } from '../../../../shared/exceptions/domain.exception';
import { masteryStatus, updateBKT } from '../../domain/adaptive';
import { DrizzleAdaptiveRepository } from '../../infrastructure/drizzle-adaptive.repository';
import { DrizzleEvaluationRepository } from '../../infrastructure/drizzle-evaluation.repository';

// Parámetros BKT por defecto cuando la competencia aún no tiene estado.
// Alineados con AdaptiveService.recordAnswer.
const BKT_DEFAULTS = { pInit: 0.1, pTransit: 0.2, pSlip: 0.1, pGuess: 0.2 };

// Umbral de acierto para propagar la nota manual al motor BKT: ≥50% del puntaje = "correcto".
const CORRECT_THRESHOLD = 0.5;

type GradedAttempt = Awaited<ReturnType<DrizzleEvaluationRepository['gradeOpenAnswer']>>;

export class GradeOpenAnswerCommand implements ICommand {
  constructor(
    public readonly answerId: string,
    public readonly points: number,
  ) {}
}

@CommandHandler(GradeOpenAnswerCommand)
export class GradeOpenAnswerHandler implements ICommandHandler<
  GradeOpenAnswerCommand,
  GradedAttempt
> {
  constructor(
    private readonly evaluations: DrizzleEvaluationRepository,
    private readonly adaptive: DrizzleAdaptiveRepository,
  ) {}

  async execute(cmd: GradeOpenAnswerCommand): Promise<GradedAttempt> {
    // 1) Califica la respuesta abierta y recalcula el score del intento (sin cambios).
    const attempt = await this.evaluations.gradeOpenAnswer(cmd.answerId, cmd.points);

    // 2) Datos para propagar el juicio del docente al motor de competencias.
    const answer = await this.evaluations.getAnswerById(cmd.answerId);
    if (!answer) throw new EntityNotFoundException('Respuesta', cmd.answerId);
    const question = await this.adaptive.getQuestion(answer.questionId);
    if (!question) throw new EntityNotFoundException('Pregunta', answer.questionId);

    const studentId = attempt.studentId;
    const maxPoints = Number(question.points);
    const earned = Number(answer.pointsEarned);
    const norm = maxPoints > 0 ? earned / maxPoints : 0;
    const correct = norm >= CORRECT_THRESHOLD;

    // 3) Sin competencias mapeadas → nada que propagar.
    const competencyIds = await this.adaptive.getQuestionCompetencies(question.id);

    // 4) Un paso BKT por competencia del ítem (mismo patrón que el flujo adaptativo).
    for (const competencyId of competencyIds) {
      const state = await this.adaptive.getBktState(studentId, competencyId);
      const params = {
        pTransit: state ? Number(state.pTransit) : BKT_DEFAULTS.pTransit,
        pSlip: state ? Number(state.pSlip) : BKT_DEFAULTS.pSlip,
        pGuess: state ? Number(state.pGuess) : BKT_DEFAULTS.pGuess,
      };
      const pKnow0 = state ? Number(state.pKnow) : BKT_DEFAULTS.pInit;
      const pKnow = updateBKT(pKnow0, correct, params);

      await this.adaptive.upsertBktState({ userId: studentId, competencyId, pKnow, ...params });
      await this.adaptive.upsertCompetencyProgress({
        userId: studentId,
        competencyId,
        mastery: pKnow,
        status: masteryStatus(pKnow),
      });
    }

    return attempt;
  }
}
