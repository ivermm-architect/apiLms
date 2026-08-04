import { Course } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { EntityNotFoundException } from '../../../../shared/exceptions/domain.exception';
import { COURSE_REPOSITORY, CourseRepository } from '../../domain/ports/course.repository';

export class GetCourseQuery implements IQuery {
  constructor(
    public readonly identifier: string,
    public readonly by: 'id' | 'slug' = 'id',
  ) {}
}

@QueryHandler(GetCourseQuery)
export class GetCourseHandler implements IQueryHandler<GetCourseQuery, Course> {
  constructor(@Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository) {}

  async execute(q: GetCourseQuery): Promise<Course> {
    const course =
      q.by === 'slug'
        ? await this.repo.findBySlug(q.identifier)
        : await this.repo.findById(q.identifier);
    if (!course) throw new EntityNotFoundException('Course', q.identifier);
    return course;
  }
}
