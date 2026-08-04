import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { idColumn, riskLevelEnum, timestamps } from './_common';
import { courses } from './catalog';
import { users } from './identity';

// Reportes académicos agregados
export const reports = pgTable(
  'reports',
  {
    id: idColumn(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    avgScore: numeric('avg_score', { precision: 5, scale: 2 }),
    progressPercentage: numeric('progress_percentage', { precision: 5, scale: 2 }),
    lessonsCompleted: integer('lessons_completed').notNull().default(0),
    totalLessons: integer('total_lessons').notNull().default(0),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    insights: jsonb('insights'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('reports_student_idx').on(t.studentId),
    courseIdx: index('reports_course_idx').on(t.courseId),
    periodIdx: index('reports_period_idx').on(t.periodStart, t.periodEnd),
  }),
);

// Alertas de riesgo académico
export const alerts = pgTable(
  'alerts',
  {
    id: idColumn(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    alertType: varchar('alert_type', { length: 50 }).notNull(), // 'low_score' | 'inactivity' | 'risk'
    severity: riskLevelEnum('severity').notNull().default('medium'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('alerts_student_idx').on(t.studentId),
    courseIdx: index('alerts_course_idx').on(t.courseId),
    severityIdx: index('alerts_severity_idx').on(t.severity),
  }),
);

export const reportsRelations = relations(reports, ({ one }) => ({
  student: one(users, { fields: [reports.studentId], references: [users.id] }),
  course: one(courses, { fields: [reports.courseId], references: [courses.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  student: one(users, { fields: [alerts.studentId], references: [users.id] }),
  course: one(courses, { fields: [alerts.courseId], references: [courses.id] }),
  acknowledgedByUser: one(users, {
    fields: [alerts.acknowledgedBy],
    references: [users.id],
  }),
}));

export type Report = typeof reports.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
