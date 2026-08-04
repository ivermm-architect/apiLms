import { Course } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import {
  EntityNotFoundException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { COURSE_REPOSITORY, CourseRepository } from '../../domain/ports/course.repository';

export class UpdateCourseCommand implements ICommand {
  constructor(
    public readonly courseId: string,
    public readonly actorId: string,
    public readonly actorRoles: string[],
    public readonly input: Partial<{
      title: string;
      subtitle: string;
      description: string;
      requirements: string;
      targetAudience: string;
      coverImageUrl: string;
      level: 'beginner' | 'intermediate' | 'advanced';
      academicYear: number;
      language: string;
    }>,
  ) {}
}

@CommandHandler(UpdateCourseCommand)
export class UpdateCourseHandler implements ICommandHandler<UpdateCourseCommand, Course> {
  constructor(@Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository) {}

  async execute(cmd: UpdateCourseCommand): Promise<Course> {
    const course = await this.repo.findById(cmd.courseId);
    if (!course) throw new EntityNotFoundException('Course', cmd.courseId);

    const isAdmin = cmd.actorRoles.includes('admin');
    if (!isAdmin && course.instructorId !== cmd.actorId) {
      throw new ForbiddenDomainException('Solo el instructor o un admin puede editar este curso');
    }

    const patch: Partial<typeof course> = {};
    if (cmd.input.title !== undefined) patch.title = cmd.input.title;
    if (cmd.input.subtitle !== undefined) patch.subtitle = cmd.input.subtitle;
    if (cmd.input.description !== undefined) patch.description = cmd.input.description;
    if (cmd.input.requirements !== undefined) patch.requirements = cmd.input.requirements;
    if (cmd.input.targetAudience !== undefined) patch.targetAudience = cmd.input.targetAudience;
    if (cmd.input.coverImageUrl !== undefined) patch.coverImageUrl = cmd.input.coverImageUrl;
    if (cmd.input.level !== undefined) patch.level = cmd.input.level;
    if (cmd.input.academicYear !== undefined) patch.academicYear = cmd.input.academicYear;
    if (cmd.input.language !== undefined) patch.language = cmd.input.language;

    return this.repo.update(cmd.courseId, patch);
  }
}
