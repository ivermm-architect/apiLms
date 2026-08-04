import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import {
  EnrollmentRepository,
  LessonProgressRepository,
} from '../domain/ports/enrollment.repository';

@Injectable()
export class DrizzleEnrollmentRepository implements EnrollmentRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByUserAndCourse(userId: string, courseId: string) {
    const [row] = await this.db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }

  async listByUser(userId: string) {
    return this.db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, userId))
      .orderBy(desc(schema.enrollments.enrolledAt));
  }

  async create(input: { userId: string; courseId: string; expiresAt?: Date }) {
    // Obtener total de lecciones
    const [stats] = await this.db
      .select({ total: count() })
      .from(schema.lessons)
      .where(and(eq(schema.lessons.courseId, input.courseId), eq(schema.lessons.isActive, true)));

    const totalLessons = Number(stats?.total ?? 0);

    const [row] = await this.db
      .insert(schema.enrollments)
      .values({
        userId: input.userId,
        courseId: input.courseId,
        expiresAt: input.expiresAt,
        totalLessons,
        status: 'active',
      })
      .returning();
    return row!;
  }

  async updateProgress(
    id: string,
    input: { lessonsCompleted: number; progressPercentage: number; lastLessonId?: string },
  ) {
    const [row] = await this.db
      .update(schema.enrollments)
      .set({
        lessonsCompleted: input.lessonsCompleted,
        progressPercentage: String(input.progressPercentage),
        lastLessonId: input.lastLessonId,
        updatedAt: new Date(),
        startedAt: input.lessonsCompleted > 0 ? new Date() : undefined,
      })
      .where(eq(schema.enrollments.id, id))
      .returning();
    return row!;
  }

  async complete(id: string) {
    const [row] = await this.db
      .update(schema.enrollments)
      .set({
        status: 'completed',
        completedAt: new Date(),
        progressPercentage: '100',
        updatedAt: new Date(),
      })
      .where(eq(schema.enrollments.id, id))
      .returning();
    return row!;
  }

  async delete(id: string) {
    // Hard delete: la FK de lesson_progress cae en cascada. La matrícula no
    // tiene soft-delete, así que desmatricular borra la fila por completo.
    await this.db.delete(schema.enrollments).where(eq(schema.enrollments.id, id));
  }
}

@Injectable()
export class DrizzleLessonProgressRepository implements LessonProgressRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByUserAndLesson(userId: string, lessonId: string) {
    const [row] = await this.db
      .select()
      .from(schema.lessonProgress)
      .where(
        and(eq(schema.lessonProgress.userId, userId), eq(schema.lessonProgress.lessonId, lessonId)),
      )
      .limit(1);
    return row ?? null;
  }

  async listByEnrollment(enrollmentId: string) {
    return this.db
      .select()
      .from(schema.lessonProgress)
      .where(eq(schema.lessonProgress.enrollmentId, enrollmentId));
  }

  async upsert(input: {
    enrollmentId: string;
    userId: string;
    lessonId: string;
    isCompleted: boolean;
  }) {
    const existing = await this.findByUserAndLesson(input.userId, input.lessonId);

    if (existing) {
      const [row] = await this.db
        .update(schema.lessonProgress)
        .set({
          isCompleted: input.isCompleted || existing.isCompleted,
          completedAt:
            input.isCompleted && !existing.isCompleted ? new Date() : existing.completedAt,
          viewCount: existing.viewCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.lessonProgress.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await this.db
      .insert(schema.lessonProgress)
      .values({
        ...input,
        completedAt: input.isCompleted ? new Date() : null,
        viewCount: 1,
      })
      .returning();
    return row!;
  }

  async countCompletedByEnrollment(enrollmentId: string): Promise<number> {
    const [r] = await this.db
      .select({ total: count() })
      .from(schema.lessonProgress)
      .where(
        and(
          eq(schema.lessonProgress.enrollmentId, enrollmentId),
          eq(schema.lessonProgress.isCompleted, true),
        ),
      );
    return Number(r?.total ?? 0);
  }
}
