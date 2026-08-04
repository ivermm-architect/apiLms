import { relations } from 'drizzle-orm';
import {
  boolean,
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

import { difficultyLevelEnum, idColumn, timestamps } from './_common';
import { courses, lessons } from './catalog';
import { enrollments } from './enrollment';
import { users } from './identity';

// Calificaciones (docente → estudiante en curso/sección/clase)
export const grades = pgTable(
  'grades',
  {
    id: idColumn(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    maxScore: numeric('max_score', { precision: 5, scale: 2 }).notNull().default('100'),
    weight: numeric('weight', { precision: 3, scale: 2 }).notNull().default('1'),
    feedback: text('feedback'),
    gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('grades_student_idx').on(t.studentId),
    courseIdx: index('grades_course_idx').on(t.courseId),
    enrollmentIdx: index('grades_enrollment_idx').on(t.enrollmentId),
  }),
);

// Evaluaciones (test/quiz/examen)
export const evaluations = pgTable(
  'evaluations',
  {
    id: idColumn(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    difficulty: difficultyLevelEnum('difficulty').notNull().default('medium'),
    timeLimitMinutes: integer('time_limit_minutes'),
    passingScore: numeric('passing_score', { precision: 5, scale: 2 }).notNull().default('60'),
    maxAttempts: integer('max_attempts').notNull().default(3),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    courseIdx: index('evaluations_course_idx').on(t.courseId),
    lessonIdx: index('evaluations_lesson_idx').on(t.lessonId),
  }),
);

// Preguntas de evaluación (soporta múltiple opción + abierta + verdadero/falso)
export const evaluationQuestions = pgTable(
  'evaluation_questions',
  {
    id: idColumn(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    questionType: varchar('question_type', { length: 30 }).notNull(), // 'multiple_choice' | 'true_false' | 'open' | 'fill_blank'
    options: jsonb('options').$type<Array<{ id: string; text: string; isCorrect: boolean }>>(),
    correctAnswer: text('correct_answer'),
    explanation: text('explanation'),
    points: numeric('points', { precision: 5, scale: 2 }).notNull().default('1'),
    difficulty: difficultyLevelEnum('difficulty').notNull().default('medium'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    evaluationIdx: index('evaluation_questions_evaluation_idx').on(t.evaluationId),
  }),
);

// Intentos de evaluación por estudiante
export const evaluationAttempts = pgTable(
  'evaluation_attempts',
  {
    id: idColumn(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    score: numeric('score', { precision: 5, scale: 2 }),
    maxScore: numeric('max_score', { precision: 5, scale: 2 }),
    percentage: numeric('percentage', { precision: 5, scale: 2 }),
    isPassed: boolean('is_passed').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    timeSpentSeconds: integer('time_spent_seconds'),
    ...timestamps,
  },
  (t) => ({
    studentIdx: index('evaluation_attempts_student_idx').on(t.studentId),
    evaluationIdx: index('evaluation_attempts_evaluation_idx').on(t.evaluationId),
  }),
);

// Respuestas por intento
export const evaluationAnswers = pgTable(
  'evaluation_answers',
  {
    id: idColumn(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => evaluationAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => evaluationQuestions.id, { onDelete: 'cascade' }),
    answer: text('answer'),
    isCorrect: boolean('is_correct'),
    pointsEarned: numeric('points_earned', { precision: 5, scale: 2 }).notNull().default('0'),
    ...timestamps,
  },
  (t) => ({
    attemptIdx: index('evaluation_answers_attempt_idx').on(t.attemptId),
  }),
);

// Relaciones
export const gradesRelations = relations(grades, ({ one }) => ({
  student: one(users, { fields: [grades.studentId], references: [users.id] }),
  teacher: one(users, { fields: [grades.teacherId], references: [users.id] }),
  course: one(courses, { fields: [grades.courseId], references: [courses.id] }),
  lesson: one(lessons, { fields: [grades.lessonId], references: [lessons.id] }),
  enrollment: one(enrollments, { fields: [grades.enrollmentId], references: [enrollments.id] }),
}));

export const evaluationsRelations = relations(evaluations, ({ one, many }) => ({
  course: one(courses, { fields: [evaluations.courseId], references: [courses.id] }),
  lesson: one(lessons, { fields: [evaluations.lessonId], references: [lessons.id] }),
  questions: many(evaluationQuestions),
  attempts: many(evaluationAttempts),
}));

export const evaluationQuestionsRelations = relations(evaluationQuestions, ({ one, many }) => ({
  evaluation: one(evaluations, {
    fields: [evaluationQuestions.evaluationId],
    references: [evaluations.id],
  }),
  answers: many(evaluationAnswers),
}));

export const evaluationAttemptsRelations = relations(evaluationAttempts, ({ one, many }) => ({
  evaluation: one(evaluations, {
    fields: [evaluationAttempts.evaluationId],
    references: [evaluations.id],
  }),
  student: one(users, { fields: [evaluationAttempts.studentId], references: [users.id] }),
  enrollment: one(enrollments, {
    fields: [evaluationAttempts.enrollmentId],
    references: [enrollments.id],
  }),
  answers: many(evaluationAnswers),
}));

export const evaluationAnswersRelations = relations(evaluationAnswers, ({ one }) => ({
  attempt: one(evaluationAttempts, {
    fields: [evaluationAnswers.attemptId],
    references: [evaluationAttempts.id],
  }),
  question: one(evaluationQuestions, {
    fields: [evaluationAnswers.questionId],
    references: [evaluationQuestions.id],
  }),
}));

export type Grade = typeof grades.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type EvaluationQuestion = typeof evaluationQuestions.$inferSelect;
export type EvaluationAttempt = typeof evaluationAttempts.$inferSelect;
export type EvaluationAnswer = typeof evaluationAnswers.$inferSelect;
