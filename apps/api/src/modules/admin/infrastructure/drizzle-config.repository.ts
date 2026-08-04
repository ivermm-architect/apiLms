import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleSystemConfigRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(key: string): Promise<unknown> {
    const [row] = await this.db
      .select()
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, key))
      .limit(1);
    return row?.value ?? null;
  }

  async set(key: string, value: unknown, description?: string) {
    const [row] = await this.db
      .insert(schema.systemConfig)
      .values({ key, value: value as Record<string, unknown>, description })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: value as Record<string, unknown>, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async list() {
    return this.db.select().from(schema.systemConfig);
  }

  async delete(key: string) {
    await this.db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, key));
  }
}
