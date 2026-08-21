import { Database } from '@cieba/db';
import { describe, expect, it, vi } from 'vitest';

import { createUserRolesLoader } from './user-roles.loader';

/**
 * Mock mínimo del query builder de Drizzle: select().from().innerJoin().where()
 * es un thenable que resuelve las filas simuladas. Registramos cada `where` para
 * contar cuántas consultas reales se disparan (clave de la prueba de batching).
 */
function buildDb(rows: Array<{ userId: string; roleName: string }>) {
  const whereCalls: Array<unknown> = [];
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn((cond: unknown) => {
      whereCalls.push(cond);
      return Promise.resolve(rows);
    }),
  } as unknown as Database;
  return { db, whereCalls };
}

describe('createUserRolesLoader', () => {
  it('agrupa múltiples load() en UNA sola consulta (batching)', async () => {
    const { db, whereCalls } = buildDb([
      { userId: 'u1', roleName: 'admin' },
      { userId: 'u1', roleName: 'teacher' },
      { userId: 'u2', roleName: 'student' },
    ]);
    const loader = createUserRolesLoader(db);

    const [r1, r2, r3] = await Promise.all([
      loader.load('u1'),
      loader.load('u2'),
      loader.load('u3'),
    ]);

    // Tres claves pedidas en el mismo tick ⇒ un único SELECT.
    expect(whereCalls).toHaveLength(1);
    expect(r1).toEqual(['admin', 'teacher']);
    expect(r2).toEqual(['student']);
    // Usuario sin roles ⇒ array vacío alineado por clave, no undefined.
    expect(r3).toEqual([]);
  });

  it('cachea por clave dentro de la petición (no reconsulta la misma clave)', async () => {
    const { db, whereCalls } = buildDb([{ userId: 'u1', roleName: 'admin' }]);
    const loader = createUserRolesLoader(db);

    await loader.load('u1');
    await loader.load('u1');

    expect(whereCalls).toHaveLength(1);
  });

  it('preserva el orden de las claves de entrada en la salida', async () => {
    // Filas devueltas en orden inverso: el loader debe reordenar por clave.
    const { db } = buildDb([
      { userId: 'b', roleName: 'student' },
      { userId: 'a', roleName: 'admin' },
    ]);
    const loader = createUserRolesLoader(db);

    const results = await loader.loadMany(['a', 'b']);

    expect(results).toEqual([['admin'], ['student']]);
  });
});
