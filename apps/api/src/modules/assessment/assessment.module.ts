import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { AdaptiveService } from './application/adaptive.service';
import { CalibrateItemHandler } from './application/commands/calibrate-item.command';
import { GradeOpenAnswerHandler } from './application/commands/grade-open-answer.command';
import { GradeStudentHandler } from './application/commands/grade-student.command';
import { RunDiagnosticHandler } from './application/commands/run-diagnostic.command';
import { StartAdaptiveExamHandler } from './application/commands/start-adaptive-exam.command';
import { StartEvaluationHandler } from './application/commands/start-evaluation.command';
import { StartLeveledExamHandler } from './application/commands/start-leveled-exam.command';
import { SubmitAdaptiveAnswerHandler } from './application/commands/submit-adaptive-answer.command';
import { SubmitEvaluationHandler } from './application/commands/submit-evaluation.command';
import { SubmitLeveledAnswerHandler } from './application/commands/submit-leveled-answer.command';
import { GetMyRecommendationsHandler } from './application/queries/get-my-recommendations.query';
import { RECOMMENDATION_REASON } from './domain/leveled/ports';
import { ANSWER_FEEDBACK_SUGGESTER } from './domain/ports/answer-feedback-suggester.port';
import { ITEM_PRIOR } from './domain/ports/item-prior.port';
import { QUESTION_SUGGESTER } from './domain/ports/question-suggester.port';
import { DrizzleAdaptiveRepository } from './infrastructure/drizzle-adaptive.repository';
import { DrizzleEvaluationRepository } from './infrastructure/drizzle-evaluation.repository';
import { DrizzleGradeRepository } from './infrastructure/drizzle-grade.repository';
import { LlmAnswerFeedbackSuggesterAdapter } from './infrastructure/llm-answer-feedback-suggester.adapter';
import { LlmItemPriorAdapter } from './infrastructure/llm-item-prior.adapter';
import { LlmQuestionSuggesterAdapter } from './infrastructure/llm-question-suggester.adapter';
import { LlmRecommendationReasonAdapter } from './infrastructure/llm-recommendation-reason.adapter';
import { AdaptiveResolver } from './presentation/adaptive.resolver';
import { AssessmentResolver } from './presentation/assessment.resolver';
import { LeveledResolver } from './presentation/leveled.resolver';

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    DrizzleGradeRepository,
    DrizzleEvaluationRepository,
    DrizzleAdaptiveRepository,
    AdaptiveService,
    GradeStudentHandler,
    GradeOpenAnswerHandler,
    StartEvaluationHandler,
    SubmitEvaluationHandler,
    StartAdaptiveExamHandler,
    SubmitAdaptiveAnswerHandler,
    StartLeveledExamHandler,
    SubmitLeveledAnswerHandler,
    GetMyRecommendationsHandler,
    CalibrateItemHandler,
    RunDiagnosticHandler,
    AssessmentResolver,
    AdaptiveResolver,
    LeveledResolver,
    // Puerto de inicialización asistida por IA (cold-start), capa opcional.
    { provide: ITEM_PRIOR, useClass: LlmItemPriorAdapter },
    // Puerto de redacción asistida por IA de la justificación (leveled), opcional.
    { provide: RECOMMENDATION_REASON, useClass: LlmRecommendationReasonAdapter },
    // Puerto de SUGERENCIA de preguntas asistida por IA (creación de evaluación), opcional.
    { provide: QUESTION_SUGGESTER, useClass: LlmQuestionSuggesterAdapter },
    // Puerto de SUGERENCIA de retroalimentación asistida por IA (calificar abiertas), opcional.
    { provide: ANSWER_FEEDBACK_SUGGESTER, useClass: LlmAnswerFeedbackSuggesterAdapter },
  ],
  exports: [DrizzleEvaluationRepository, DrizzleGradeRepository],
})
export class AssessmentModule {}
