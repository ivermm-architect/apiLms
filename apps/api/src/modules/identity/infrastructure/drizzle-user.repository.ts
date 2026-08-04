import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import {
  CreateUserRepoInput,
  ListUsersInput,
  UserRepository,
} from '../domain/ports/user.repository';

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async list(input: ListUsersInput) {
    const { filter, page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [isNull(schema.users.deletedAt)];

    if (filter?.status) conditions.push(eq(schema.users.status, filter.status));
    if (filter?.search) {
      const s = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(schema.users.email, s),
          ilike(schema.users.firstName, s),
          ilike(schema.users.lastName, s),
        )!,
      );
    }

    const whereClause = and(...conditions);
    const orderCol = schema.users[sortBy] ?? schema.users.createdAt;
    const orderBy = sortOrder === 'asc' ? asc(orderCol) : desc(orderCol);

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.users)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(schema.users).where(whereClause),
    ]);

    return { items, total: Number(totalRows[0]?.total ?? 0) };
  }

  async create(input: CreateUserRepoInput) {
    const [row] = await this.db
      .insert(schema.users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        birthday: input.birthday ? input.birthday.toISOString().slice(0, 10) : undefined,
        profession: input.profession,
        documentId: input.documentId,
        studentCode: input.studentCode,
        mustChangePassword: input.mustChangePassword ?? false,
        status: input.status ?? 'active',
      })
      .returning();
    return row!;
  }

  async update(id: string, input: Partial<typeof schema.users.$inferInsert>) {
    const [row] = await this.db
      .update(schema.users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return row!;
  }

  async softDelete(id: string) {
    await this.db
      .update(schema.users)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(eq(schema.users.id, id));
  }

  async assignRoles(userId: string, roleIds: string[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
      if (roleIds.length > 0) {
        await tx.insert(schema.userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
      }
    });
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, userId));
    return rows.map((r) => r.name);
  }
}
