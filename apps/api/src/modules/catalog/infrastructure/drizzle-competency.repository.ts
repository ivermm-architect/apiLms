import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleCompetencyRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listByCourse(courseId: string) {
    return this.db
      .select()
      .from(schema.competencies)
      .where(eq(schema.competencies.courseId, courseId))
      .orderBy(asc(schema.competencies.code));
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.competencies)
      .where(eq(schema.competencies.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(input: {
    courseId: string;
    code: string;
    name: string;
    description?: string | null;
  }) {
    const [row] = await this.db.insert(schema.competencies).values(input).returning();
    return row!;
  }

  async update(id: string, input: { code?: string; name?: string; description?: string | null }) {
    const [row] = await this.db
      .update(schema.competencies)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.competencies.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(schema.competencies).where(eq(schema.competencies.id, id));
  }

  // ---------- Lección ↔ competencia ----------

  async linkLesson(lessonId: string, competencyId: string): Promise<void> {
    await this.db
      .insert(schema.lessonCompetencies)
      .values({ lessonId, competencyId })
      .onConflictDoNothing();
  }

  async unlinkLesson(lessonId: string, competencyId: string): Promise<void> {
    await this.db
      .delete(schema.lessonCompetencies)
      .where(
        and(
          eq(schema.lessonCompetencies.lessonId, lessonId),
          eq(schema.lessonCompetencies.competencyId, competencyId),
        ),
      );
  }

  async listByLesson(lessonId: string) {
    return this.db
      .select({
        id: schema.competencies.id,
        courseId: schema.competencies.courseId,
        code: schema.competencies.code,
        name: schema.competencies.name,
        description: schema.competencies.description,
      })
      .from(schema.lessonCompetencies)
      .innerJoin(
        schema.competencies,
        eq(schema.lessonCompetencies.competencyId, schema.competencies.id),
      )
      .where(eq(schema.lessonCompetencies.lessonId, lessonId));
  }

  // ---------- Pregunta ↔ competencia ----------

  async linkQuestion(questionId: string, competencyId: string): Promise<void> {
    await this.db
      .insert(schema.questionCompetencies)
      .values({ questionId, competencyId })
      .onConflictDoNothing();
  }

  async unlinkQuestion(questionId: string, competencyId: string): Promise<void> {
    await this.db
      .delete(schema.questionCompetencies)
      .where(
        and(
          eq(schema.questionCompetencies.questionId, questionId),
          eq(schema.questionCompetencies.competencyId, competencyId),
        ),
      );
  }

  /** courseId dueño de una competencia (para verificación de propiedad). */
  async getCourseId(competencyId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: schema.competencies.courseId })
      .from(schema.competencies)
      .where(eq(schema.competencies.id, competencyId))
      .limit(1);
    return row?.courseId ?? null;
  }
}
