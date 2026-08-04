import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleGradeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.grades)
      .where(eq(schema.grades.id, id))
      .limit(1);
    return row ?? null;
  }

  async listByStudent(studentId: string, courseId?: string) {
    const conditions = [eq(schema.grades.studentId, studentId)];
    if (courseId) conditions.push(eq(schema.grades.courseId, courseId));
    return this.db
      .select()
      .from(schema.grades)
      .where(and(...conditions))
      .orderBy(desc(schema.grades.gradedAt));
  }

  async listByCourse(courseId: string) {
    return this.db
      .select()
      .from(schema.grades)
      .where(eq(schema.grades.courseId, courseId))
      .orderBy(desc(schema.grades.gradedAt));
  }

  async create(input: {
    studentId: string;
    teacherId: string;
    courseId: string;
    enrollmentId: string;
    lessonId?: string;
    title: string;
    score: number;
    maxScore?: number;
    weight?: number;
    feedback?: string;
  }) {
    const [row] = await this.db
      .insert(schema.grades)
      .values({
        ...input,
        score: String(input.score),
        maxScore: String(input.maxScore ?? 100),
        weight: String(input.weight ?? 1),
      })
      .returning();
    return row!;
  }

  async update(id: string, input: { score?: number; feedback?: string }) {
    const patch: Partial<typeof schema.grades.$inferInsert> = { updatedAt: new Date() };
    if (input.score !== undefined) patch.score = String(input.score);
    if (input.feedback !== undefined) patch.feedback = input.feedback;
    const [row] = await this.db
      .update(schema.grades)
      .set(patch)
      .where(eq(schema.grades.id, id))
      .returning();
    return row!;
  }

  async delete(id: string) {
    await this.db.delete(schema.grades).where(eq(schema.grades.id, id));
  }
}
