import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://uto:uto_dev_password@localhost:5432/uto_lms',
  },
  verbose: true,
  strict: true,
  migrations: {
    prefix: 'timestamp',
  },
});
