import { Enrollment } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  ENROLLMENT_REPOSITORY,
  EnrollmentRepository,
} from '../../domain/ports/enrollment.repository';

export class MyEnrollmentsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(MyEnrollmentsQuery)
export class MyEnrollmentsHandler implements IQueryHandler<MyEnrollmentsQuery, Enrollment[]> {
  constructor(@Inject(ENROLLMENT_REPOSITORY) private readonly repo: EnrollmentRepository) {}

  async execute(q: MyEnrollmentsQuery): Promise<Enrollment[]> {
    return this.repo.listByUser(q.userId);
  }
}
