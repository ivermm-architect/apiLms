import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { GradeOpenAnswerHandler } from './application/commands/grade-open-answer.command';
import { GradeStudentHandler } from './application/commands/grade-student.command';
import { StartEvaluationHandler } from './application/commands/start-evaluation.command';
import { SubmitEvaluationHandler } from './application/commands/submit-evaluation.command';
import { ANSWER_FEEDBACK_SUGGESTER } from './domain/ports/answer-feedback-suggester.port';
import { QUESTION_SUGGESTER } from './domain/ports/question-suggester.port';
import { DrizzleEvaluationRepository } from './infrastructure/drizzle-evaluation.repository';
import { DrizzleGradeRepository } from './infrastructure/drizzle-grade.repository';
import { LlmAnswerFeedbackSuggesterAdapter } from './infrastructure/llm-answer-feedback-suggester.adapter';
import { LlmQuestionSuggesterAdapter } from './infrastructure/llm-question-suggester.adapter';
import { AssessmentResolver } from './presentation/assessment.resolver';

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    DrizzleGradeRepository,
    DrizzleEvaluationRepository,
    GradeStudentHandler,
    GradeOpenAnswerHandler,
    StartEvaluationHandler,
    SubmitEvaluationHandler,
    AssessmentResolver,
    // Puerto de SUGERENCIA de preguntas asistida por IA (creación de evaluación), opcional.
    { provide: QUESTION_SUGGESTER, useClass: LlmQuestionSuggesterAdapter },
    // Puerto de SUGERENCIA de retroalimentación asistida por IA (calificar abiertas), opcional.
    { provide: ANSWER_FEEDBACK_SUGGESTER, useClass: LlmAnswerFeedbackSuggesterAdapter },
  ],
  exports: [DrizzleEvaluationRepository, DrizzleGradeRepository],
})
export class AssessmentModule {}
