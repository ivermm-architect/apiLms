import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { CreateBulkStudentsHandler } from './application/commands/create-bulk-students.command';
import { CreateUserHandler } from './application/commands/create-user.command';
import { UpdateUserHandler } from './application/commands/update-user.command';
import { GetUserHandler } from './application/queries/get-user.query';
import { ListUsersHandler } from './application/queries/list-users.query';
import { USER_REPOSITORY } from './domain/ports/user.repository';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository';
import { UserResolver } from './presentation/user.resolver';

const CommandHandlers = [CreateUserHandler, CreateBulkStudentsHandler, UpdateUserHandler];
const QueryHandlers = [GetUserHandler, ListUsersHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    ...CommandHandlers,
    ...QueryHandlers,
    UserResolver,
  ],
  exports: [USER_REPOSITORY],
})
export class IdentityModule {}
