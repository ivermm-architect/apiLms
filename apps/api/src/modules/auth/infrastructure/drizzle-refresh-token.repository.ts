import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../domain/ports/refresh-token.repository';

@Injectable()
export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<StoredRefreshToken> {
    const [row] = await this.db
      .insert(schema.refreshTokens)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      })
      .returning();

    return this.toStored(row!);
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.refreshTokens.id })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.sessionId, sessionId),
          isNull(schema.refreshTokens.revokedAt),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return !!row;
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const [row] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(eq(schema.refreshTokens.tokenHash, tokenHash), isNull(schema.refreshTokens.revokedAt)),
      )
      .limit(1);

    return row ? this.toStored(row) : null;
  }

  async findByHashAny(tokenHash: string): Promise<StoredRefreshToken | null> {
    const [row] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
      .limit(1);

    return row ? this.toStored(row) : null;
  }

  async revoke(id: string, replacedBy?: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date(), replacedBy })
      .where(eq(schema.refreshTokens.id, id));
  }

  async revokeBySessionId(sessionId: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshTokens.sessionId, sessionId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
  }

  private toStored(row: typeof schema.refreshTokens.$inferSelect): StoredRefreshToken {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }
}
