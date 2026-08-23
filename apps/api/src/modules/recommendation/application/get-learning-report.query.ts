import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  LEARNING_REPORT_NARRATOR,
  LearningReportNarratorPort,
} from '../domain/ports/learning-report-narrator.port';
import { DrizzleLearningReportRepository } from '../infrastructure/drizzle-learning-report.repository';

export class GetLearningReportQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

/**
 * Resultado del informe de aprendizaje. `generated=false` significa que la IA
 * está deshabilitada, falló o el estudiante no tiene datos: la UI oculta el
 * informe (degradación elegante, tesis §2.9 + punto 14).
 */
export interface LearningReportResult {
  generated: boolean;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

const EMPTY: LearningReportResult = {
  generated: false,
  summary: null,
  strengths: [],
  weaknesses: [],
  recommendations: [],
};

/**
 * Orquesta el informe de aprendizaje (tesis §2.9):
 *  1) Reúne los HECHOS reales del estudiante (avance + promedios), sin psicometría.
 *  2) La IA los REDACTA en lenguaje natural (fortalezas, debilidades, recomendaciones).
 *  3) Si la IA está apagada, falla o no hay datos, devuelve `generated=false`.
 */
@QueryHandler(GetLearningReportQuery)
export class GetLearningReportHandler implements IQueryHandler<
  GetLearningReportQuery,
  LearningReportResult
> {
  constructor(
    private readonly repo: DrizzleLearningReportRepository,
    @Inject(LEARNING_REPORT_NARRATOR) private readonly narrator: LearningReportNarratorPort,
  ) {}

  async execute(query: GetLearningReportQuery): Promise<LearningReportResult> {
    const courses = await this.repo.getStudentCourseFacts(query.userId);
    if (courses.length === 0) return EMPTY;

    const narration = await this.narrator.narrate({ courses });
    if (!narration) return EMPTY;

    return {
      generated: true,
      summary: narration.summary || null,
      strengths: narration.strengths,
      weaknesses: narration.weaknesses,
      recommendations: narration.recommendations,
    };
  }
}
