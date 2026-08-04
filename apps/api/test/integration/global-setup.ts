import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Global setup para los tests de integración app-layer.
// Garantiza que exista una BD de test dedicada y con el esquema migrado,
// aislada de la BD de desarrollo. Idempotente: se puede correr N veces.

const HOST = 'postgresql://cieba:cieba_dev_password@localhost:5433';
const TEST_DB = 'cieba_lms_test';
const TEST_URL = process.env.TEST_DATABASE_URL ?? `${HOST}/${TEST_DB}`;

export async function setup() {
  // 1. Crear la BD de test si no existe (conectando a la BD de mantenimiento).
  const admin = postgres(`${HOST}/postgres`, { max: 1, onnotice: () => {} });
  try {
    const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`;
    if (rows.length === 0) {
      await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await admin.end();
  }

  // 2. Aplicar migraciones (skip de las ya aplicadas).
  const client = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), '../../packages/db/drizzle'),
    });
  } finally {
    await client.end();
  }
}
