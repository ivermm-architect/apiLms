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
import { SubmitAdaptiveAnswerHandler } from './application/commands/submit-adaptive-answer.command';
import { SubmitEvaluationHandler } from './application/commands/submit-evaluation.command';
import { IssueCertificateHandler } from './application/event-handlers/issue-certificate.handler';
import { ITEM_PRIOR } from './domain/ports/item-prior.port';
import { DrizzleAdaptiveRepository } from './infrastructure/drizzle-adaptive.repository';
import { DrizzleCertificateRepository } from './infrastructure/drizzle-certificate.repository';
import { DrizzleEvaluationRepository } from './infrastructure/drizzle-evaluation.repository';
import { DrizzleGradeRepository } from './infrastructure/drizzle-grade.repository';
import { LlmItemPriorAdapter } from './infrastructure/llm-item-prior.adapter';
import { AdaptiveResolver } from './presentation/adaptive.resolver';
import { AssessmentResolver } from './presentation/assessment.resolver';

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    DrizzleGradeRepository,
    DrizzleEvaluationRepository,
    DrizzleCertificateRepository,
    DrizzleAdaptiveRepository,
    AdaptiveService,
    GradeStudentHandler,
    GradeOpenAnswerHandler,
    StartEvaluationHandler,
    SubmitEvaluationHandler,
    IssueCertificateHandler,
    StartAdaptiveExamHandler,
    SubmitAdaptiveAnswerHandler,
    CalibrateItemHandler,
    RunDiagnosticHandler,
    AssessmentResolver,
    AdaptiveResolver,
    // Puerto de inicialización asistida por IA (cold-start), capa opcional.
    { provide: ITEM_PRIOR, useClass: LlmItemPriorAdapter },
  ],
  exports: [DrizzleCertificateRepository, DrizzleEvaluationRepository, DrizzleGradeRepository],
})
export class AssessmentModule {}
