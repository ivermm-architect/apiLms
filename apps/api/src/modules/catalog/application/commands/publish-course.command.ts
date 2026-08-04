import { Course } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import {
  ConflictDomainException,
  EntityNotFoundException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { COURSE_REPOSITORY, CourseRepository } from '../../domain/ports/course.repository';

export class PublishCourseCommand implements ICommand {
  constructor(
    public readonly courseId: string,
    public readonly actorId: string,
    public readonly actorRoles: string[],
  ) {}
}

@CommandHandler(PublishCourseCommand)
export class PublishCourseHandler implements ICommandHandler<PublishCourseCommand, Course> {
  constructor(@Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository) {}

  async execute(cmd: PublishCourseCommand): Promise<Course> {
    const course = await this.repo.findById(cmd.courseId);
    if (!course) throw new EntityNotFoundException('Course', cmd.courseId);

    const isAdmin = cmd.actorRoles.includes('admin');
    if (!isAdmin && course.instructorId !== cmd.actorId) {
      throw new ForbiddenDomainException('Solo el instructor o un admin puede publicar');
    }

    if (course.totalLessons === 0) {
      throw new ConflictDomainException('Un curso sin lecciones no puede publicarse');
    }

    return this.repo.publish(cmd.courseId);
  }
}
