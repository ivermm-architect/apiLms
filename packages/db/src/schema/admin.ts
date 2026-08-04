import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { auditActionEnum, idColumn, timestamps } from './_common';
import { users } from './identity';

// Logs de auditoría
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: idColumn(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: uuid('entity_id'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('audit_logs_user_idx').on(t.userId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    createdIdx: index('audit_logs_created_idx').on(t.createdAt),
  }),
);

// Configuración del sistema (clave-valor)
export const systemConfig = pgTable(
  'system_config',
  {
    id: idColumn(),
    key: varchar('key', { length: 100 }).notNull().unique(),
    value: jsonb('value').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => ({
    keyIdx: index('system_config_key_idx').on(t.key),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
