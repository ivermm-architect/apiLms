import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';
import { seedPermissions } from './seed-permissions';

/* ─────────────────────────────────────────────────────────────
   CIEBA LMS · Backfill de permisos
   Puebla permissions + role_permissions sobre la BD viva sin
   re-seed completo. Idempotente. Ejecutar ANTES de desplegar los
   guards de permisos: así todo usuario obtiene sus permisos al
   refrescar (derivados del rol, dentro del JWT).
   ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms';
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.info('🔐 Backfill de permisos (permissions + role_permissions)...');
  const stats = await seedPermissions(db);
  console.info(`   • ${stats.permissions} permisos en el diccionario`);
  console.info(`   • ${stats.rolePermissions} filas role_permissions`);
  console.info('✅ Backfill completado');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
