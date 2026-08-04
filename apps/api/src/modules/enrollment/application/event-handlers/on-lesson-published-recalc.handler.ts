import { schema, Database } from '@cieba/db';
import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { and, count, eq } from 'drizzle-orm';

import { DATABASE } from '../../../../core/database/database.module';
import { LessonPublishedEvent } from '../../../catalog/domain/events/lesson-published.event';

/**
 * Opción A: al añadir una lección, recalcula el progreso de todos los inscritos.
 * Si un alumno estaba `completed` y el contenido nuevo lo deja por debajo del
 * 100%, su inscripción vuelve a `active`.
 */
@EventsHandler(LessonPublishedEvent)
export class OnLessonPublishedRecalcHandler implements IEventHandler<LessonPublishedEvent> {
  private readonly logger = new Logger(OnLessonPublishedRecalcHandler.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async handle(event: LessonPublishedEvent): Promise<void> {
    try {
      // Total de lecciones activas del curso (nuevo denominador).
      const [totals] = await this.db
        .select({ total: count() })
        .from(schema.lessons)
        .where(and(eq(schema.lessons.courseId, event.courseId), eq(schema.lessons.isActive, true)));
      const totalLessons = Number(totals?.total ?? 0);
      if (totalLessons === 0) return;

      const enrollments = await this.db
        .select({ id: schema.enrollments.id, status: schema.enrollments.status })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.courseId, event.courseId));

      let reopened = 0;
      for (const e of enrollments) {
        const [done] = await this.db
          .select({ c: count() })
          .from(schema.lessonProgress)
          .where(
            and(
              eq(schema.lessonProgress.enrollmentId, e.id),
              eq(schema.lessonProgress.isCompleted, true),
            ),
          );
        const lessonsCompleted = Number(done?.c ?? 0);
        const pct = Math.min(100, (lessonsCompleted / totalLessons) * 100);
        const reopen = e.status === 'completed' && pct < 100;
        if (reopen) reopened++;

        await this.db
          .update(schema.enrollments)
          .set({
            totalLessons,
            lessonsCompleted,
            progressPercentage: String(pct),
            ...(reopen ? { status: 'active' as const, completedAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.enrollments.id, e.id));
      }

      this.logger.log(
        `Curso ${event.courseId}: ${enrollments.length} inscritos recalculados ` +
          `(total=${totalLessons}, reabiertos=${reopened})`,
      );
    } catch (err) {
      // Nunca tumbar el proceso por un recálculo fallido.
      this.logger.error(`Recalc de progreso falló: ${(err as Error).message}`);
    }
  }
}
