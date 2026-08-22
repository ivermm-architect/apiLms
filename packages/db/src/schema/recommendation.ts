import { relations, sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { idColumn, timestamps } from './_common';
import { courses, lessons } from './catalog';
import { users } from './identity';

// Recomendación personalizada al cerrar un intento de evaluación adaptativa
// (documento Tabla 14). La DECISIÓN (refuerzo/avance) es DETERMINISTA (motor
// leveled); la IA solo redacta `reason`. Por eso `source_ai` se registra
// siempre como 'openai-compatible' y ante fallo de IA se guarda el texto base.
export const recommendationAi = pgTable(
  'recommendation_ai',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    // "clase" = lección de refuerzo/avance sugerida (nullable).
    claseId: uuid('clase_id').references(() => lessons.id, { onDelete: 'set null' }),
    recommendationType: varchar('recommendation_type', { length: 20 }).notNull(),
    reason: text('reason').notNull(),
    sourceAi: varchar('source_ai', { length: 100 }).notNull().default('openai-compatible'),
    effectivenessScore: numeric('effectiveness_score').default('0'),
    status: varchar('status', { length: 20 }).default('pending'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('recommendation_ai_user_idx').on(t.userId),
    typeCheck: check(
      'recommendation_ai_type_check',
      sql`${t.recommendationType} in ('refuerzo', 'avance')`,
    ),
  }),
);

export const recommendationAiRelations = relations(recommendationAi, ({ one }) => ({
  user: one(users, { fields: [recommendationAi.userId], references: [users.id] }),
  course: one(courses, { fields: [recommendationAi.courseId], references: [courses.id] }),
  clase: one(lessons, { fields: [recommendationAi.claseId], references: [lessons.id] }),
}));

export type RecommendationAi = typeof recommendationAi.$inferSelect;
