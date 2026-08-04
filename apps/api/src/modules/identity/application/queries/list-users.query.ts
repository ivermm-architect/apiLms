import { User } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  USER_REPOSITORY,
  ListUsersInput,
  UserRepository,
} from '../../domain/ports/user.repository';

export class ListUsersQuery implements IQuery {
  constructor(public readonly input: ListUsersInput) {}
}

export interface ListUsersResult {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery, ListUsersResult> {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepository) {}

  async execute(q: ListUsersQuery): Promise<ListUsersResult> {
    const { items, total } = await this.repo.list(q.input);
    return { items, total, page: q.input.page, pageSize: q.input.pageSize };
  }
}
