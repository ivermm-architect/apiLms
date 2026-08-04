import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { EnrollHandler } from './application/commands/enroll.command';
import { TrackLessonViewHandler } from './application/commands/track-lesson-view.command';
import { OnLessonPublishedRecalcHandler } from './application/event-handlers/on-lesson-published-recalc.handler';
import { MyEnrollmentsHandler } from './application/queries/my-enrollments.query';
import {
  ENROLLMENT_REPOSITORY,
  LESSON_PROGRESS_REPOSITORY,
} from './domain/ports/enrollment.repository';
import {
  DrizzleEnrollmentRepository,
  DrizzleLessonProgressRepository,
} from './infrastructure/drizzle-enrollment.repository';
import { EnrollmentResolver } from './presentation/enrollment.resolver';

const CommandHandlers = [EnrollHandler, TrackLessonViewHandler];
const QueryHandlers = [MyEnrollmentsHandler];
const EventHandlers = [OnLessonPublishedRecalcHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    { provide: ENROLLMENT_REPOSITORY, useClass: DrizzleEnrollmentRepository },
    { provide: LESSON_PROGRESS_REPOSITORY, useClass: DrizzleLessonProgressRepository },
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    EnrollmentResolver,
  ],
  exports: [ENROLLMENT_REPOSITORY, LESSON_PROGRESS_REPOSITORY],
})
export class EnrollmentModule {}
