import { index, pgTable, varchar } from 'drizzle-orm/pg-core';

import { contentStatusEnum, idColumn, timestamps } from './_common';

export const curricula = pgTable(
  'curricula',
  {
    id: idColumn(),
    name: varchar('name', { length: 200 }).notNull(),
    resolution: varchar('resolution', { length: 120 }),
    status: contentStatusEnum('status').notNull().default('draft'),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('curricula_status_idx').on(t.status),
  }),
);

export type Curriculum = typeof curricula.$inferSelect;
