import { User } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { EntityNotFoundException } from '../../../../shared/exceptions/domain.exception';
import { USER_REPOSITORY, UserRepository } from '../../domain/ports/user.repository';

export class GetUserQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepository) {}

  async execute(q: GetUserQuery): Promise<User> {
    const user = await this.repo.findById(q.userId);
    if (!user) throw new EntityNotFoundException('User', q.userId);
    return user;
  }
}
