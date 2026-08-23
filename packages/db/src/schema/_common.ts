import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

export const idColumn = () => uuid('id').primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

// Enums globales

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended', 'pending']);

export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);

export const courseLevelEnum = pgEnum('course_level', ['beginner', 'intermediate', 'advanced']);

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active',
  'completed',
  'cancelled',
  'expired',
]);

export const difficultyLevelEnum = pgEnum('difficulty_level', ['easy', 'medium', 'hard']);

export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high', 'critical']);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'failed_login',
  'permission_denied',
]);
