import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { idColumn, timestamps } from './_common';
import { users } from './identity';

// Refresh tokens persistidos (rotación + revocación)
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Identidad estable de la sesión (dispositivo/navegador). Se hereda entre
    // rotaciones de refresh token para que "Sesiones activas" y la validación
    // del access token puedan identificar la sesión sin depender de IP/UA.
    sessionId: uuid('session_id').notNull().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    expiresIdx: index('refresh_tokens_expires_idx').on(t.expiresAt),
    sessionIdx: index('refresh_tokens_session_idx').on(t.sessionId),
  }),
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export type RefreshToken = typeof refreshTokens.$inferSelect;
