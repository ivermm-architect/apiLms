import { PERMISSIONS, ROLE_PERMISSIONS } from '@cieba/shared';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from './schema/index';

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Siembra el diccionario de permisos (fuente de verdad: @cieba/shared) y el
 * join rol→permiso desde ROLE_PERMISSIONS. Idempotente (onConflictDoNothing):
 * reutilizable por el seed base y por el backfill sobre la BD viva.
 */
export async function seedPermissions(
  db: Db,
): Promise<{ permissions: number; rolePermissions: number }> {
  // 1. Insertar los códigos del diccionario (permissions.code es UNIQUE).
  const codes = Object.values(PERMISSIONS);
  await db
    .insert(schema.permissions)
    .values(codes.map((code) => ({ code })))
    .onConflictDoNothing();

  // 2. Cargar ids reales por código.
  const perms = await db.select().from(schema.permissions);
  const permByCode = new Map(perms.map((p) => [p.code, p]));

  // 3. Cargar roles por nombre.
  const roles = await db.select().from(schema.roles);
  const roleByName = new Map(roles.map((r) => [r.name, r]));

  // 4. Construir filas role_permissions desde la matriz.
  const rows: { roleId: string; permissionId: string }[] = [];
  for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByName.get(roleName);
    if (!role) continue;
    for (const code of permCodes) {
      const perm = permByCode.get(code);
      if (!perm) continue;
      rows.push({ roleId: role.id, permissionId: perm.id });
    }
  }

  if (rows.length > 0) {
    await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
  }

  return { permissions: codes.length, rolePermissions: rows.length };
}
