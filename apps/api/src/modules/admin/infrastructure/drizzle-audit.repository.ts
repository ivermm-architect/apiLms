import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleAuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async log(input: {
    userId?: string;
    action:
      | 'create'
      | 'read'
      | 'update'
      | 'delete'
      | 'login'
      | 'logout'
      | 'failed_login'
      | 'permission_denied';
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await this.db.insert(schema.auditLogs).values(input).returning();
    return row!;
  }

  async list(filter?: {
    userId?: string;
    entityType?: string;
    action?: typeof schema.auditLogs.$inferInsert.action;
    limit?: number;
  }) {
    const conds = [];
    if (filter?.userId) conds.push(eq(schema.auditLogs.userId, filter.userId));
    if (filter?.entityType) conds.push(eq(schema.auditLogs.entityType, filter.entityType));
    if (filter?.action) conds.push(eq(schema.auditLogs.action, filter.action));

    let query = this.db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        ipAddress: schema.auditLogs.ipAddress,
        userAgent: schema.auditLogs.userAgent,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.userId))
      .$dynamic();
    if (conds.length > 0) query = query.where(and(...conds));

    return query.orderBy(desc(schema.auditLogs.createdAt)).limit(filter?.limit ?? 100);
  }
}
