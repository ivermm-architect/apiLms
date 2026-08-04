import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import postgres from 'postgres';

/**
 * Drop completo del schema `public` + recreate vacío.
 * Solo para dev/testing. NUNCA correr en producción.
 */
async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://uto:uto_dev_password@localhost:5432/uto_lms';

  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ABORT: reset no se permite en NODE_ENV=production');
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });

  console.info('💣 Reseteando base de datos (DROP SCHEMA public CASCADE)...');
  await client`DROP SCHEMA IF EXISTS public CASCADE`;
  await client`CREATE SCHEMA public`;
  await client`GRANT ALL ON SCHEMA public TO public`;
  console.info('✅ Schema vacío. Ahora corre: pnpm migrate && pnpm seed');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
