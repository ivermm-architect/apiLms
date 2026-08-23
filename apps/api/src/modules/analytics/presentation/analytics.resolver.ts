import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { DetectAlertsCommand, DetectAlertsResult } from '../application/detect-alerts.command';
import { DrizzleAnalyticsRepository } from '../infrastructure/drizzle-analytics.repository';

import {
  AdminDashboardOverviewType,
  AlertType,
  CohortReportRowType,
  StudentReportType,
} from './dto/analytics.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class AnalyticsResolver {
  constructor(
    private readonly repo: DrizzleAnalyticsRepository,
    private readonly commandBus: CommandBus,
  ) {}

  /** Ejecuta el escaneo de estudiantes en riesgo y devuelve cuántas alertas creó. */
  @Mutation(() => Int)
  @RequirePermissions(PERMISSIONS.ANALYTICS_ADMIN)
  async runAlertScan(): Promise<number> {
    const r = await this.commandBus.execute<DetectAlertsCommand, DetectAlertsResult>(
      new DetectAlertsCommand(),
    );
    return r.created;
  }

  @Query(() => StudentReportType)
  async studentReport(
    @Args('studentId') studentId: string,
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<StudentReportType> {
    // Estudiantes solo pueden ver su propio reporte
    const isSelf = user.sub === studentId;
    const isPrivileged = user.roles.includes('admin') || user.roles.includes('teacher');
    if (!isSelf && !isPrivileged) {
      throw new Error('No puedes ver el reporte de otro estudiante');
    }
    return this.repo.buildStudentCourseReport(studentId, courseId);
  }

  @Query(() => StudentReportType)
  async myCourseReport(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<StudentReportType> {
    return this.repo.buildStudentCourseReport(user.sub, courseId);
  }

  @Query(() => [AlertType])
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  async alerts(@Args('courseId', { nullable: true }) courseId?: string): Promise<AlertType[]> {
    const rows = await this.repo.listAlerts(courseId, true);
    return rows as unknown as AlertType[];
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  async acknowledgeAlert(
    @Args('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.repo.acknowledgeAlert(id, user.sub);
    return true;
  }

  @Query(() => AdminDashboardOverviewType)
  @RequirePermissions(PERMISSIONS.ANALYTICS_ADMIN)
  adminDashboardOverview(): Promise<AdminDashboardOverviewType> {
    return this.repo.getAdminDashboardOverview() as unknown as Promise<AdminDashboardOverviewType>;
  }

  /** Reporte institucional por cohorte (año de ingreso). Solo admin. */
  @Query(() => [CohortReportRowType])
  @RequirePermissions(PERMISSIONS.ANALYTICS_ADMIN)
  cohortReport(): Promise<CohortReportRowType[]> {
    return this.repo.getCohortReport();
  }
}
