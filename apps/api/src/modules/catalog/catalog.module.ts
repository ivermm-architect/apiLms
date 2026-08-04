import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { CreateCourseHandler } from './application/commands/create-course.command';
import { PublishCourseHandler } from './application/commands/publish-course.command';
import { UpdateCourseHandler } from './application/commands/update-course.command';
import { CurriculumPdfService } from './application/curriculum-pdf.service';
import { GetCourseHandler } from './application/queries/get-course.query';
import { ListCoursesHandler } from './application/queries/list-courses.query';
import { COURSE_REPOSITORY } from './domain/ports/course.repository';
import { DrizzleCompetencyRepository } from './infrastructure/drizzle-competency.repository';
import { DrizzleCourseRepository } from './infrastructure/drizzle-course.repository';
import { DrizzleLessonRepository } from './infrastructure/drizzle-lesson.repository';
import { DrizzleSectionRepository } from './infrastructure/drizzle-section.repository';
import { CatalogResolver } from './presentation/catalog.resolver';
import { CompetencyResolver } from './presentation/competency.resolver';
import { CurriculumController } from './presentation/curriculum.controller';
import { MallaResolver } from './presentation/malla.resolver';
import { ScheduleResolver } from './presentation/schedule.resolver';

const CommandHandlers = [CreateCourseHandler, UpdateCourseHandler, PublishCourseHandler];
const QueryHandlers = [GetCourseHandler, ListCoursesHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [CurriculumController],
  providers: [
    { provide: COURSE_REPOSITORY, useClass: DrizzleCourseRepository },
    DrizzleSectionRepository,
    DrizzleLessonRepository,
    DrizzleCompetencyRepository,
    CurriculumPdfService,
    ...CommandHandlers,
    ...QueryHandlers,
    CatalogResolver,
    CompetencyResolver,
    MallaResolver,
    ScheduleResolver,
  ],
  exports: [
    COURSE_REPOSITORY,
    DrizzleSectionRepository,
    DrizzleLessonRepository,
    DrizzleCompetencyRepository,
  ],
})
export class CatalogModule {}
