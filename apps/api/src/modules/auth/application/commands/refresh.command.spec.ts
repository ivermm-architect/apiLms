import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnauthorizedDomainException } from '../../../../shared/exceptions/domain.exception';

import { RefreshCommand, RefreshHandler } from './refresh.command';

const TOKEN = 'refresh-token-xyz';
const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');

const buildHandler = (overrides?: { active?: unknown; any?: unknown; verify?: () => unknown }) => {
  // Query builder encadenable que sirve a las dos consultas del handler:
  //  - roles:      select().from().innerJoin().where()  → await ⇒ []
  //  - refetch RT: select().from().where().limit(1)      → [{ userAgent, ipAddress }]
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue([{ userAgent: null, ipAddress: null }]);
  // Hace el builder "awaitable": await chain ⇒ [] (la consulta de roles).
  chain.then = (resolve: (v: unknown[]) => unknown) => resolve([]);
  const db = { select: vi.fn().mockReturnValue(chain) };

  const tokens = {
    verifyRefresh:
      overrides?.verify ?? vi.fn().mockReturnValue({ sub: 'u1', email: 'u@x.com', roles: [] }),
    generatePair: vi.fn().mockReturnValue({ accessToken: 'new-a', refreshToken: 'new-r' }),
  };

  const refreshTokens = {
    findByHash: vi.fn().mockResolvedValue(overrides?.active ?? null),
    findByHashAny: vi.fn().mockResolvedValue(overrides?.any ?? null),
    save: vi.fn().mockResolvedValue({ id: 'rt-new' }),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };

  const handler = new RefreshHandler(db as never, tokens as never, refreshTokens as never);
  return { handler, tokens, refreshTokens };
};

describe('RefreshHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rota el token: revoca el anterior y emite par nuevo', async () => {
    const stored = { id: 'rt-old', userId: 'u1', expiresAt: new Date(Date.now() + 3600_000) };
    const { handler, refreshTokens } = buildHandler({ active: stored });

    const pair = await handler.execute(new RefreshCommand(TOKEN));

    expect(pair.refreshToken).toBe('new-r');
    expect(refreshTokens.save).toHaveBeenCalled();
    expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-old', 'rt-new');
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('reuse-detection: token revocado reutilizado → revoca toda la familia', async () => {
    // No está activo, pero existe revocado (replay de token filtrado)
    const { handler, refreshTokens } = buildHandler({
      active: null,
      any: { id: 'rt-old', userId: 'u1', revokedAt: new Date() },
    });

    await expect(handler.execute(new RefreshCommand(TOKEN))).rejects.toBeInstanceOf(
      UnauthorizedDomainException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('token inexistente → rechaza sin revocar familia', async () => {
    const { handler, refreshTokens } = buildHandler({ active: null, any: null });

    await expect(handler.execute(new RefreshCommand(TOKEN))).rejects.toBeInstanceOf(
      UnauthorizedDomainException,
    );
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('firma inválida → rechaza', async () => {
    const { handler, refreshTokens } = buildHandler({
      verify: vi.fn().mockImplementation(() => {
        throw new Error('bad signature');
      }),
    });

    await expect(handler.execute(new RefreshCommand(TOKEN))).rejects.toBeInstanceOf(
      UnauthorizedDomainException,
    );
    expect(refreshTokens.findByHash).not.toHaveBeenCalled();
  });

  it('token expirado → rechaza', async () => {
    const stored = { id: 'rt-old', userId: 'u1', expiresAt: new Date(Date.now() - 1000) };
    const { handler } = buildHandler({ active: stored });

    await expect(handler.execute(new RefreshCommand(TOKEN))).rejects.toBeInstanceOf(
      UnauthorizedDomainException,
    );
  });

  it('usa el hash sha256 del token presentado', async () => {
    const stored = { id: 'rt-old', userId: 'u1', expiresAt: new Date(Date.now() + 3600_000) };
    const { handler, refreshTokens } = buildHandler({ active: stored });

    await handler.execute(new RefreshCommand(TOKEN));

    expect(refreshTokens.findByHash).toHaveBeenCalledWith(hashOf(TOKEN));
  });
});
