import { relations } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { idColumn, timestamps } from './_common';
import { evaluationQuestions } from './assessment';
import { competencies } from './competency';
import { users } from './identity';

// Parámetros IRT del ítem (modelo 2PL; c=0 salvo que se use 3PL).
// a = discriminación, b = dificultad, c = pseudo-adivinación.
export const itemIrtParams = pgTable('item_irt_params', {
  id: idColumn(),
  questionId: uuid('question_id')
    .notNull()
    .unique()
    .references(() => evaluationQuestions.id, { onDelete: 'cascade' }),
  a: numeric('a', { precision: 8, scale: 4 }).notNull().default('1'),
  b: numeric('b', { precision: 8, scale: 4 }).notNull().default('0'),
  c: numeric('c', { precision: 8, scale: 4 }).notNull().default('0'),
  // Nº de respuestas usadas en la última calibración (trazabilidad).
  sampleSize: numeric('sample_size', { precision: 10, scale: 0 }).notNull().default('0'),
  // Origen de los parámetros (trazabilidad de la capa opcional de IA):
  // 'empirical' = calibración canónica con datos reales.
  // 'ai_prior'  = semilla asistida por IA en cold-start (sampleSize=0).
  // null        = legado / sin marcar.
  source: varchar('source', { length: 16 }),
  calibratedAt: timestamp('calibrated_at', { withTimezone: true }),
  ...timestamps,
});

// Estimación de habilidad θ (theta) y su error estándar (SE),
// por (usuario, competencia) o a nivel global/curso según `scope`.
export const abilityEstimates = pgTable(
  'ability_estimates',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // null cuando scope != 'competency' (p.ej. estimación global del examen).
    competencyId: uuid('competency_id').references(() => competencies.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).notNull().default('competency'), // 'competency' | 'global' | 'course'
    theta: numeric('theta', { precision: 8, scale: 4 }).notNull().default('0'),
    se: numeric('se', { precision: 8, scale: 4 }).notNull().default('1'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('ability_estimates_user_idx').on(t.userId),
    uniq: unique('ability_estimates_user_competency_scope_unique').on(
      t.userId,
      t.competencyId,
      t.scope,
    ),
  }),
);

// Estado del modelo Bayesian Knowledge Tracing por (usuario, competencia).
// pKnow = P(conoce) actual; pTransit/pSlip/pGuess = parámetros del modelo.
export const bktStates = pgTable(
  'bkt_states',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'cascade' }),
    pKnow: numeric('p_know', { precision: 6, scale: 5 }).notNull().default('0.10'),
    pTransit: numeric('p_transit', { precision: 6, scale: 5 }).notNull().default('0.20'),
    pSlip: numeric('p_slip', { precision: 6, scale: 5 }).notNull().default('0.10'),
    pGuess: numeric('p_guess', { precision: 6, scale: 5 }).notNull().default('0.20'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique('bkt_states_user_competency_unique').on(t.userId, t.competencyId),
    userIdx: index('bkt_states_user_idx').on(t.userId),
  }),
);

// Relaciones
export const itemIrtParamsRelations = relations(itemIrtParams, ({ one }) => ({
  question: one(evaluationQuestions, {
    fields: [itemIrtParams.questionId],
    references: [evaluationQuestions.id],
  }),
}));

export const abilityEstimatesRelations = relations(abilityEstimates, ({ one }) => ({
  user: one(users, { fields: [abilityEstimates.userId], references: [users.id] }),
  competency: one(competencies, {
    fields: [abilityEstimates.competencyId],
    references: [competencies.id],
  }),
}));

export const bktStatesRelations = relations(bktStates, ({ one }) => ({
  user: one(users, { fields: [bktStates.userId], references: [users.id] }),
  competency: one(competencies, {
    fields: [bktStates.competencyId],
    references: [competencies.id],
  }),
}));

export type ItemIrtParams = typeof itemIrtParams.$inferSelect;
export type AbilityEstimate = typeof abilityEstimates.$inferSelect;
export type BktState = typeof bktStates.$inferSelect;
