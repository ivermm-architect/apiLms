import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Context, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import { GqlContext } from '../../../core/graphql/loaders/loaders.factory';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import {
  BulkResult,
  CreateBulkStudentsCommand,
} from '../application/commands/create-bulk-students.command';
import { CreateUserCommand, CreateUserResult } from '../application/commands/create-user.command';
import { UpdateUserCommand } from '../application/commands/update-user.command';
import { GetUserQuery } from '../application/queries/get-user.query';
import { ListUsersHandler, ListUsersQuery } from '../application/queries/list-users.query';

import {
  BulkCreateStudentsInput,
  CreateUserInput,
  ListUsersInput,
  UpdateUserInput,
} from './dto/user.input';
import { BulkResultRow, CreatedUserType, UserListType, UserType } from './dto/user.types';

@UseGuards(RolesGuard)
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  /**
   * Resuelve `roles` por campo. Si el resolver raíz ya materializó los roles
   * (p. ej. una consulta que los trae en lote), se reutilizan; si no, se piden
   * al DataLoader de la petición, que agrupa todos los userId del listado en
   * UNA sola consulta (evita el N+1 clásico de "un SELECT de roles por usuario").
   */
  @ResolveField(() => [String], { nullable: true })
  roles(@Parent() user: UserType, @Context() ctx: GqlContext): string[] | Promise<string[]> {
    if (user.roles) return user.roles;
    return ctx.loaders.userRoles.load(user.id);
  }

  @Query(() => UserType)
  @RequirePermissions(PERMISSIONS.USER_READ)
  async user(@Args('id') id: string): Promise<UserType> {
    const user = await this.queryBus.execute(new GetUserQuery(id));
    return user as UserType;
  }

  @Query(() => UserListType)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async users(@Args('input', { nullable: true }) input?: ListUsersInput): Promise<UserListType> {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    const result = await this.queryBus.execute<
      ListUsersQuery,
      Awaited<ReturnType<ListUsersHandler['execute']>>
    >(
      new ListUsersQuery({
        page,
        pageSize,
        filter: { search: input?.search, status: input?.status },
        sortBy: input?.sortBy as 'createdAt' | 'email' | 'lastName' | undefined,
        sortOrder: input?.sortOrder,
      }),
    );

    return {
      items: result.items as UserType[],
      meta: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    };
  }

  @Mutation(() => CreatedUserType)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async createUser(
    @Args('input') input: CreateUserInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CreatedUserType> {
    const result = await this.commandBus.execute<CreateUserCommand, CreateUserResult>(
      new CreateUserCommand(input),
    );

    await this.audit
      .log({
        userId: actor.sub,
        action: 'create',
        entityType: 'user',
        entityId: result.user.id,
        metadata: {
          description: `Usuario creado: ${input.email}`,
          email: input.email,
          roleIds: input.roleIds ?? [],
        },
      })
      .catch(() => {});

    return { user: result.user as unknown as UserType, tempPassword: result.tempPassword };
  }

  @Mutation(() => UserType)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async updateUser(
    @Args('id') id: string,
    @Args('input') input: UpdateUserInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<UserType> {
    const user = await this.commandBus.execute(new UpdateUserCommand(id, input));

    await this.audit
      .log({
        userId: actor.sub,
        action: 'update',
        entityType: 'user',
        entityId: id,
        metadata: {
          description: `Datos de usuario actualizados: ${user.firstName} ${user.lastName}`,
          fields: Object.keys(input),
        },
      })
      .catch(() => {});

    return user as unknown as UserType;
  }

  @Mutation(() => [BulkResultRow])
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async bulkCreateStudents(
    @Args('input') input: BulkCreateStudentsInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<BulkResultRow[]> {
    const results = await this.commandBus.execute<CreateBulkStudentsCommand, BulkResult[]>(
      new CreateBulkStudentsCommand(input.rows, input.cohortYear, input.enrollInYear ?? false),
    );

    const created = results.filter((r) => r.status === 'created').length;
    const failed = results.length - created;
    await this.audit
      .log({
        userId: actor.sub,
        action: 'create',
        entityType: 'user',
        metadata: {
          description: `Carga masiva de estudiantes (cohorte ${input.cohortYear}): ${created} creados, ${failed} con error`,
          cohortYear: input.cohortYear,
          created,
          failed,
        },
      })
      .catch(() => {});

    return results;
  }
}
