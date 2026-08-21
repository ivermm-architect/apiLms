import { schema, Database } from '@cieba/db';
import DataLoader from 'dataloader';
import { eq, inArray } from 'drizzle-orm';

/**
 * Loader por-petición: userId → nombres de rol.
 *
 * Colapsa N consultas (una por usuario) en UNA sola con `inArray`. DataLoader
 * agrupa todas las claves pedidas dentro del mismo tick y las resuelve en lote,
 * además de cachear por clave dentro de la petición (sin fugas entre peticiones,
 * porque se instancia fresco en cada contexto GraphQL).
 */
export function createUserRolesLoader(db: Database): DataLoader<string, string[]> {
  return new DataLoader<string, string[]>(async (userIds) => {
    const rows = await db
      .select({
        userId: schema.userRoles.userId,
        roleName: schema.roles.name,
      })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(inArray(schema.userRoles.userId, userIds as string[]));

    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      const arr = byUser.get(r.userId) ?? [];
      arr.push(r.roleName);
      byUser.set(r.userId, arr);
    }

    // DataLoader exige devolver un array alineado 1:1 con las claves de entrada.
    return userIds.map((id) => byUser.get(id) ?? []);
  });
}
