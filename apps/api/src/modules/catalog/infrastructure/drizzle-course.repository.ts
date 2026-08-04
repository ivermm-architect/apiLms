import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { CourseRepository, ListCoursesInput } from '../domain/ports/course.repository';

@Injectable()
export class DrizzleCourseRepository implements CourseRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.courses)
      .where(and(eq(schema.courses.id, id), isNull(schema.courses.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string) {
    const [row] = await this.db
      .select()
      .from(schema.courses)
      .where(and(eq(schema.courses.slug, slug), isNull(schema.courses.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async list(input: ListCoursesInput) {
    const { filter, page, pageSize, sortBy = 'createdAt', sortOrder = 'desc' } = input;
    const offset = (page - 1) * pageSize;

    const conditions = [isNull(schema.courses.deletedAt)];

    // Full-text search (español, acento-insensible vía unaccent) sobre
    // title+subtitle+description, con fallback substring/prefijo. Orden por relevancia.
    const term = filter?.search?.trim().slice(0, 100);
    const ftsDoc = sql`to_tsvector('spanish', unaccent(coalesce(${schema.courses.title}, '') || ' ' || coalesce(${schema.courses.subtitle}, '') || ' ' || coalesce(${schema.courses.description}, '')))`;
    let rankExpr = null as ReturnType<typeof sql> | null;
    if (term) {
      const escaped = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      const like = `%${escaped}%`;
      const tsquery = sql`websearch_to_tsquery('spanish', unaccent(${term}))`;
      conditions.push(
        or(
          sql`${ftsDoc} @@ ${tsquery}`,
          sql`unaccent(${schema.courses.title}) ILIKE unaccent(${like})`,
          sql`unaccent(${schema.courses.description}) ILIKE unaccent(${like})`,
        )!,
      );
      rankExpr = sql`ts_rank(${ftsDoc}, ${tsquery})`;
    }
    if (filter?.instructorId) conditions.push(eq(schema.courses.instructorId, filter.instructorId));
    if (filter?.status) conditions.push(eq(schema.courses.status, filter.status));
    if (filter?.level) conditions.push(eq(schema.courses.level, filter.level));
    if (filter?.academicYear) conditions.push(eq(schema.courses.academicYear, filter.academicYear));

    const whereClause = and(...conditions);
    const orderCol = schema.courses[sortBy] ?? schema.courses.createdAt;
    // Al buscar, prima la relevancia full-text; si no, el orden pedido.
    const orderBy = rankExpr
      ? desc(rankExpr)
      : sortOrder === 'asc'
        ? asc(orderCol)
        : desc(orderCol);

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.courses)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(schema.courses).where(whereClause),
    ]);

    return { items, total: Number(totalRows[0]?.total ?? 0) };
  }

  async create(input: {
    title: string;
    slug: string;
    description: string;
    instructorId: string;
    curriculumId?: string | null;
    subtitle?: string | null;
    level?: typeof schema.courses.$inferInsert.level;
    academicYear?: number;
    language?: string;
  }) {
    const [row] = await this.db
      .insert(schema.courses)
      .values({
        title: input.title,
        slug: input.slug,
        description: input.description,
        instructorId: input.instructorId,
        curriculumId: input.curriculumId ?? undefined,
        subtitle: input.subtitle ?? undefined,
        level: input.level,
        academicYear: input.academicYear,
        language: input.language,
      })
      .returning();
    return row!;
  }

  async update(id: string, input: Partial<typeof schema.courses.$inferInsert>) {
    const [row] = await this.db
      .update(schema.courses)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.courses.id, id))
      .returning();
    return row!;
  }

  async softDelete(id: string) {
    await this.db
      .update(schema.courses)
      .set({ deletedAt: new Date(), status: 'archived' })
      .where(eq(schema.courses.id, id));
  }

  async publish(id: string) {
    const [row] = await this.db
      .update(schema.courses)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(schema.courses.id, id))
      .returning();
    return row!;
  }

  async recalculateStats(id: string) {
    // Cuenta lecciones activas + duración total
    const [stats] = await this.db
      .select({
        totalLessons: count(schema.lessons.id),
      })
      .from(schema.lessons)
      .where(and(eq(schema.lessons.courseId, id), eq(schema.lessons.isActive, true)));

    await this.db
      .update(schema.courses)
      .set({
        totalLessons: Number(stats?.totalLessons ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(schema.courses.id, id));
  }
}
