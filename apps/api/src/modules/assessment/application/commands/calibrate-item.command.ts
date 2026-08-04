import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { calibrateItem } from '../../domain/adaptive';
import { ITEM_PRIOR, type ItemPriorPort } from '../../domain/ports/item-prior.port';
import { DrizzleAdaptiveRepository } from '../../infrastructure/drizzle-adaptive.repository';

export interface CalibrateItemResult {
  questionId: string;
  a: number;
  b: number;
  sampleSize: number;
  calibrated: boolean;
  /** Origen de los parámetros: 'empirical' | 'ai_prior' | null (no calibrado). */
  source: 'empirical' | 'ai_prior' | null;
}

export class CalibrateItemCommand implements ICommand {
  constructor(public readonly questionId: string) {}
}

@CommandHandler(CalibrateItemCommand)
export class CalibrateItemHandler
  implements ICommandHandler<CalibrateItemCommand, CalibrateItemResult>
{
  constructor(
    private readonly repo: DrizzleAdaptiveRepository,
    @Inject(ITEM_PRIOR) private readonly itemPrior: ItemPriorPort,
  ) {}

  async execute(cmd: CalibrateItemCommand): Promise<CalibrateItemResult> {
    const rows = await this.repo.getItemResponses(cmd.questionId);
    const data = rows.map((r) => ({
      correct: r.correct ?? false,
      totalScore: Number(r.totalScore ?? 0),
    }));

    // 1) Vía CANÓNICA: calibración empírica con datos reales (sin cambios).
    const result = calibrateItem(data);
    if (result) {
      await this.repo.upsertIrtParams({
        questionId: cmd.questionId,
        a: result.a,
        b: result.b,
        sampleSize: result.sampleSize,
        source: 'empirical',
      });
      return {
        questionId: cmd.questionId,
        a: result.a,
        b: result.b,
        sampleSize: result.sampleSize,
        calibrated: true,
        source: 'empirical',
      };
    }

    // 2) COLD-START (sin evidencia suficiente). Capa OPCIONAL de IA: solo se
    //    intenta si AI_CALIBRATION_ENABLED=true. El adaptador devuelve null si la
    //    IA está apagada, de modo que el comportamiento por defecto es idéntico.
    const item = await this.repo.getItemStatement(cmd.questionId);
    if (item) {
      const priors = await this.itemPrior.estimatePriors(item);
      if (priors) {
        // sampleSize:0 + source:'ai_prior' → semilla no canónica. En cuanto el
        // ítem acumule ≥10 respuestas reales, la calibración empírica la
        // SOBRESCRIBE (source:'empirical'). La IA nunca persiste sobre datos reales.
        await this.repo.upsertIrtParams({
          questionId: cmd.questionId,
          a: priors.a,
          b: priors.b,
          sampleSize: 0,
          source: 'ai_prior',
        });
        return {
          questionId: cmd.questionId,
          a: priors.a,
          b: priors.b,
          sampleSize: 0,
          calibrated: true,
          source: 'ai_prior',
        };
      }
    }

    // 3) Sin datos y sin IA → comportamiento actual (no calibrado).
    return {
      questionId: cmd.questionId,
      a: 0,
      b: 0,
      sampleSize: data.length,
      calibrated: false,
      source: null,
    };
  }
}
