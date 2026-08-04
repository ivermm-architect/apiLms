import { schema, Database } from '@cieba/db';
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, lt } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAnalyticsRepository } from '../infrastructure/drizzle-analytics.repository';

export class DetectAlertsCommand implements ICommand {}

export interface DetectAlertsResult {
  created: number;
  byType: Record<string, number>;
}

/**
 * Escanea inscripciones activas y genera alertas de estudiantes en riesgo:
 *  - inactivity: sin progreso en 14+ días y curso incompleto.
 *  - stalled: inscrito hace 30+ días con <20% de avance.
 * Deduplica contra alertas abiertas (no re-crea las ya existentes).
 */
@CommandHandler(DetectAlertsCommand)
export class DetectAlertsHandler implements ICommandHandler<
  DetectAlertsCommand,
  DetectAlertsResult
> {
  private readonly logger = new Logger(DetectAlertsHandler.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly analytics: DrizzleAnalyticsRepository,
  ) {}

  async execute(): Promise<DetectAlertsResult> {
    const existing = await this.analytics.openAlertKeys();
    const byType: Record<string, number> = { inactivity: 0, stalled: 0 };

    const rows = await this.db
      .select({
        studentId: schema.enrollments.userId,
        courseId: schema.enrollments.courseId,
        progress: schema.enrollments.progressPercentage,
        enrolledAt: schema.enrollments.enrolledAt,
        updatedAt: schema.enrollments.updatedAt,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        courseTitle: schema.courses.title,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .where(
        and(
          eq(schema.enrollments.status, 'active'),
          lt(schema.enrollments.progressPercentage, '100'),
        ),
      );

    const now = Date.now();
    const DAY = 24 * 3600 * 1000;

    for (const r of rows) {
      const name = `${r.firstName} ${r.lastName}`.trim();
      const progress = Number(r.progress);
      const inactiveDays = (now - new Date(r.updatedAt).getTime()) / DAY;
      const enrolledDays = (now - new Date(r.enrolledAt).getTime()) / DAY;

      const candidates: Array<{ type: string; severity: 'medium' | 'high'; message: string }> = [];
      if (inactiveDays >= 14) {
        candidates.push({
          type: 'inactivity',
          severity: 'medium',
          message: `${name} sin actividad en ${Math.floor(inactiveDays)} días en "${r.courseTitle}" (${progress}%)`,
        });
      }
      if (enrolledDays >= 30 && progress < 20) {
        candidates.push({
          type: 'stalled',
          severity: 'high',
          message: `${name} con solo ${progress}% tras ${Math.floor(enrolledDays)} días en "${r.courseTitle}"`,
        });
      }

      for (const c of candidates) {
        const key = `${r.studentId}:${r.courseId}:${c.type}`;
        if (existing.has(key)) continue;
        existing.add(key);
        await this.analytics.createAlert({
          studentId: r.studentId,
          courseId: r.courseId,
          alertType: c.type,
          severity: c.severity,
          message: c.message,
          metadata: { progress, inactiveDays: Math.floor(inactiveDays) },
        });
        byType[c.type] = (byType[c.type] ?? 0) + 1;
      }
    }

    const created = Object.values(byType).reduce((s, n) => s + n, 0);
    this.logger.log(`🚨 Alert scan: ${created} alertas nuevas (${JSON.stringify(byType)})`);
    return { created, byType };
  }
}
