import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { slugify } from '../domain/utils/slugify';

@Injectable()
export class DrizzleLessonRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listBySection(sectionId: string) {
    return this.db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.sectionId, sectionId))
      .orderBy(asc(schema.lessons.position));
  }

  async listByCourse(courseId: string) {
    return this.db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, courseId))
      .orderBy(asc(schema.lessons.position));
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(input: {
    sectionId: string;
    courseId: string;
    title: string;
    description?: string;
    content?: string;
    position?: number;
    isFreePreview?: boolean;
  }) {
    const slug = slugify(input.title);
    const [row] = await this.db
      .insert(schema.lessons)
      .values({ ...input, slug })
      .returning();
    await this.syncCourseLessonCount(input.courseId);
    return row!;
  }

  async update(id: string, input: Partial<typeof schema.lessons.$inferInsert>) {
    const [row] = await this.db
      .update(schema.lessons)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.lessons.id, id))
      .returning();
    return row!;
  }

  async delete(id: string) {
    const [row] = await this.db
      .select({ courseId: schema.lessons.courseId })
      .from(schema.lessons)
      .where(eq(schema.lessons.id, id))
      .limit(1);
    await this.db.delete(schema.lessons).where(eq(schema.lessons.id, id));
    if (row) await this.syncCourseLessonCount(row.courseId);
  }

  /** Recalcula courses.total_lessons a partir de las lecciones reales del curso. */
  private async syncCourseLessonCount(courseId: string) {
    const [agg] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, courseId));
    await this.db
      .update(schema.courses)
      .set({ totalLessons: Number(agg?.count ?? 0), updatedAt: new Date() })
      .where(eq(schema.courses.id, courseId));
  }
}
