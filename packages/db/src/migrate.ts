import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://uto:uto_dev_password@localhost:5432/uto_lms';

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.info('🚀 Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.info('✅ Migrations completed');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
