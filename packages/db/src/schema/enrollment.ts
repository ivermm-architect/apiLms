import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { enrollmentStatusEnum, idColumn, timestamps } from './_common';
import { courses, lessons } from './catalog';
import { users } from './identity';

// Inscripción a un curso
export const enrollments = pgTable(
  'enrollments',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    progressPercentage: numeric('progress_percentage', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    lessonsCompleted: integer('lessons_completed').notNull().default(0),
    totalLessons: integer('total_lessons').notNull().default(0),
    lastLessonId: uuid('last_lesson_id'),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => ({
    uniqueEnrollment: unique('enrollments_user_course_unique').on(t.userId, t.courseId),
    userIdx: index('enrollments_user_idx').on(t.userId),
    courseIdx: index('enrollments_course_idx').on(t.courseId),
    statusIdx: index('enrollments_status_idx').on(t.status),
  }),
);

// Progreso por lección (clases vistas)
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: idColumn(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniqueProgress: unique('lesson_progress_user_lesson_unique').on(t.userId, t.lessonId),
    enrollmentIdx: index('lesson_progress_enrollment_idx').on(t.enrollmentId),
    userIdx: index('lesson_progress_user_idx').on(t.userId),
    lessonIdx: index('lesson_progress_lesson_idx').on(t.lessonId),
  }),
);

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  course: one(courses, { fields: [enrollments.courseId], references: [courses.id] }),
  lastLesson: one(lessons, {
    fields: [enrollments.lastLessonId],
    references: [lessons.id],
  }),
  progress: many(lessonProgress),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  enrollment: one(enrollments, {
    fields: [lessonProgress.enrollmentId],
    references: [enrollments.id],
  }),
  user: one(users, { fields: [lessonProgress.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [lessonProgress.lessonId], references: [lessons.id] }),
}));

export type Enrollment = typeof enrollments.$inferSelect;
export type LessonProgress = typeof lessonProgress.$inferSelect;
