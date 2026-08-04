import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { contentStatusEnum, courseLevelEnum, idColumn, softDelete, timestamps } from './_common';
import { curricula } from './curriculum';
import { users } from './identity';

// Cursos
export const courses = pgTable(
  'courses',
  {
    id: idColumn(),
    slug: varchar('slug', { length: 200 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    subtitle: varchar('subtitle', { length: 250 }),
    description: text('description').notNull(),
    requirements: text('requirements'),
    targetAudience: text('target_audience'),
    coverImageUrl: text('cover_image_url'),
    instructorId: uuid('instructor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    curriculumId: uuid('curriculum_id').references(() => curricula.id, { onDelete: 'set null' }),
    level: courseLevelEnum('level').notNull().default('beginner'),
    academicYear: integer('academic_year').notNull().default(1),
    language: varchar('language', { length: 10 }).notNull().default('es'),
    status: contentStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').notNull().default(0),
    totalLessons: integer('total_lessons').notNull().default(0),
    totalStudents: integer('total_students').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    slugIdx: index('courses_slug_idx').on(t.slug),
    instructorIdx: index('courses_instructor_idx').on(t.instructorId),
    statusIdx: index('courses_status_idx').on(t.status),
    academicYearIdx: index('courses_academic_year_idx').on(t.academicYear),
    curriculumIdx: index('courses_curriculum_idx').on(t.curriculumId),
  }),
);

// Secciones (unidades/módulos del curso)
export const sections = pgTable(
  'sections',
  {
    id: idColumn(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('sections_course_idx').on(t.courseId),
    positionIdx: index('sections_position_idx').on(t.courseId, t.position),
  }),
);

// Lecciones (clases) — texto-primero
export const lessons = pgTable(
  'lessons',
  {
    id: idColumn(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    // Contenido textual de la lección (texto-primero, Markdown/HTML).
    content: text('content'),
    position: integer('position').notNull().default(0),
    isFreePreview: boolean('is_free_preview').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    sectionIdx: index('lessons_section_idx').on(t.sectionId),
    courseIdx: index('lessons_course_idx').on(t.courseId),
    uniqSlug: unique('lessons_course_slug_unique').on(t.courseId, t.slug),
  }),
);

// Horarios de curso (bloques semanales). Un curso puede tener N bloques.
// dayOfWeek: 1=lunes … 7=domingo (ISO 8601, ordenable de forma natural).
// start/end como 'HH:MM' (24h). Los ve el docente y el estudiante; los edita admin.
export const courseSchedules = pgTable(
  'course_schedules',
  {
    id: idColumn(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: varchar('start_time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }).notNull(),
    room: varchar('room', { length: 100 }),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('course_schedules_course_idx').on(t.courseId),
    dayIdx: index('course_schedules_day_idx').on(t.courseId, t.dayOfWeek, t.startTime),
  }),
);

// Relaciones
export const coursesRelations = relations(courses, ({ one, many }) => ({
  instructor: one(users, { fields: [courses.instructorId], references: [users.id] }),
  curriculum: one(curricula, { fields: [courses.curriculumId], references: [curricula.id] }),
  sections: many(sections),
  lessons: many(lessons),
  schedules: many(courseSchedules),
}));

export const courseSchedulesRelations = relations(courseSchedules, ({ one }) => ({
  course: one(courses, { fields: [courseSchedules.courseId], references: [courses.id] }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  course: one(courses, { fields: [sections.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  section: one(sections, { fields: [lessons.sectionId], references: [sections.id] }),
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
}));

export type Course = typeof courses.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type CourseSchedule = typeof courseSchedules.$inferSelect;
