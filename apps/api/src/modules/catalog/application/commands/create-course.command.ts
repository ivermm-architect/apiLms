import { Course } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { COURSE_REPOSITORY, CourseRepository } from '../../domain/ports/course.repository';
import { slugify } from '../../domain/utils/slugify';

export class CreateCourseCommand implements ICommand {
  constructor(
    public readonly input: {
      title: string;
      subtitle?: string;
      description: string;
      instructorId: string;
      curriculumId?: string | null;
      level?: 'beginner' | 'intermediate' | 'advanced';
      academicYear?: number;
      language?: string;
    },
  ) {}
}

@CommandHandler(CreateCourseCommand)
export class CreateCourseHandler implements ICommandHandler<CreateCourseCommand, Course> {
  constructor(@Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository) {}

  async execute(cmd: CreateCourseCommand): Promise<Course> {
    const slug = slugify(cmd.input.title);

    const existing = await this.repo.findBySlug(slug);
    if (existing) {
      throw new ConflictDomainException(`Ya existe un curso con slug "${slug}"`);
    }

    return this.repo.create({
      title: cmd.input.title,
      slug,
      subtitle: cmd.input.subtitle,
      description: cmd.input.description,
      instructorId: cmd.input.instructorId,
      curriculumId: cmd.input.curriculumId ?? null,
      level: cmd.input.level ?? 'beginner',
      academicYear: cmd.input.academicYear ?? 1,
      language: cmd.input.language ?? 'es',
    });
  }
}
