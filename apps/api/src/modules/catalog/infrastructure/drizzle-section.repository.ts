import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleSectionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByCourse(courseId: string) {
    return this.db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.courseId, courseId))
      .orderBy(asc(schema.sections.position));
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(input: {
    courseId: string;
    title: string;
    description?: string;
    position?: number;
  }) {
    const [row] = await this.db.insert(schema.sections).values(input).returning();
    return row!;
  }

  async update(id: string, input: Partial<typeof schema.sections.$inferInsert>) {
    const [row] = await this.db
      .update(schema.sections)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.sections.id, id))
      .returning();
    return row!;
  }

  async delete(id: string) {
    await this.db.delete(schema.sections).where(eq(schema.sections.id, id));
  }
}
