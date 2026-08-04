import { Course } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  COURSE_REPOSITORY,
  CourseRepository,
  ListCoursesInput,
} from '../../domain/ports/course.repository';

export class ListCoursesQuery implements IQuery {
  constructor(public readonly input: ListCoursesInput) {}
}

export interface ListCoursesResult {
  items: Course[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListCoursesQuery)
export class ListCoursesHandler implements IQueryHandler<ListCoursesQuery, ListCoursesResult> {
  constructor(@Inject(COURSE_REPOSITORY) private readonly repo: CourseRepository) {}

  async execute(q: ListCoursesQuery): Promise<ListCoursesResult> {
    const { items, total } = await this.repo.list(q.input);
    return { items, total, page: q.input.page, pageSize: q.input.pageSize };
  }
}
