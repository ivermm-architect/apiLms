export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
}

export interface RefreshTokenRepository {
  save(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<StoredRefreshToken>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  /** Busca por hash incluyendo tokens ya revocados (para detección de reuse). */
  findByHashAny(tokenHash: string): Promise<StoredRefreshToken | null>;

  /** True si existe una sesión (refresh token) vigente con ese sessionId. */
  isSessionActive(sessionId: string): Promise<boolean>;

  revoke(id: string, replacedBy?: string): Promise<void>;

  /** Revoca todas las filas vigentes de una sesión (cierra esa sesión). */
  revokeBySessionId(sessionId: string): Promise<void>;

  revokeAllForUser(userId: string): Promise<void>;
}
