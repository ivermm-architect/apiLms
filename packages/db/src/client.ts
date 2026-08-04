import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

export type Database = ReturnType<typeof createDatabase>;

// Tipo de la transacción (callback de `db.transaction`) para usar en repos
// que necesiten aceptar una conexión externa.
export type DatabaseTx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Ejecutor común: cualquier repo que acepte tx opcional debe tipar con esto.
export type DatabaseExecutor = Database | DatabaseTx;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return drizzle(client, { schema, logger: process.env.LOG_LEVEL === 'debug' });
}

export type DatabaseClient = ReturnType<typeof postgres>;
