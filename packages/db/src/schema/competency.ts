import { relations } from 'drizzle-orm';
import {
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { idColumn, masteryStatusEnum, timestamps } from './_common';
import { evaluationQuestions } from './assessment';
import { courses, lessons } from './catalog';
import { users } from './identity';

// Competencias: unidad de dominio evaluable, ligada a un curso.
export const competencies = pgTable(
  'competencies',
  {
    id: idColumn(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('competencies_course_idx').on(t.courseId),
    uniqCode: unique('competencies_course_code_unique').on(t.courseId, t.code),
  }),
);

// N:M lección ↔ competencia (qué competencias desarrolla cada lección).
export const lessonCompetencies = pgTable(
  'lesson_competencies',
  {
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.lessonId, t.competencyId] }),
    competencyIdx: index('lesson_competencies_competency_idx').on(t.competencyId),
  }),
);

// N:M pregunta (ítem del banco) ↔ competencia (qué mide cada ítem).
export const questionCompetencies = pgTable(
  'question_competencies',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => evaluationQuestions.id, { onDelete: 'cascade' }),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.questionId, t.competencyId] }),
    competencyIdx: index('question_competencies_competency_idx').on(t.competencyId),
  }),
);

// Progreso/dominio por competencia por estudiante.
export const competencyProgress = pgTable(
  'competency_progress',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'cascade' }),
    // Nivel de dominio normalizado 0..1 (derivado de θ/BKT).
    mastery: numeric('mastery', { precision: 5, scale: 4 }).notNull().default('0'),
    status: masteryStatusEnum('status').notNull().default('no_iniciada'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique('competency_progress_user_competency_unique').on(t.userId, t.competencyId),
    userIdx: index('competency_progress_user_idx').on(t.userId),
  }),
);

// Relaciones
export const competenciesRelations = relations(competencies, ({ one, many }) => ({
  course: one(courses, { fields: [competencies.courseId], references: [courses.id] }),
  lessons: many(lessonCompetencies),
  questions: many(questionCompetencies),
  progress: many(competencyProgress),
}));

export const lessonCompetenciesRelations = relations(lessonCompetencies, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonCompetencies.lessonId], references: [lessons.id] }),
  competency: one(competencies, {
    fields: [lessonCompetencies.competencyId],
    references: [competencies.id],
  }),
}));

export const questionCompetenciesRelations = relations(questionCompetencies, ({ one }) => ({
  question: one(evaluationQuestions, {
    fields: [questionCompetencies.questionId],
    references: [evaluationQuestions.id],
  }),
  competency: one(competencies, {
    fields: [questionCompetencies.competencyId],
    references: [competencies.id],
  }),
}));

export const competencyProgressRelations = relations(competencyProgress, ({ one }) => ({
  user: one(users, { fields: [competencyProgress.userId], references: [users.id] }),
  competency: one(competencies, {
    fields: [competencyProgress.competencyId],
    references: [competencies.id],
  }),
}));

export type Competency = typeof competencies.$inferSelect;
export type LessonCompetency = typeof lessonCompetencies.$inferSelect;
export type QuestionCompetency = typeof questionCompetencies.$inferSelect;
export type CompetencyProgress = typeof competencyProgress.$inferSelect;
