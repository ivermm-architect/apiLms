import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { DetectAlertsHandler } from './application/detect-alerts.command';
import { DrizzleAnalyticsRepository } from './infrastructure/drizzle-analytics.repository';
import { AnalyticsResolver } from './presentation/analytics.resolver';

@Module({
  imports: [CqrsModule, AuthModule],
  providers: [DrizzleAnalyticsRepository, DetectAlertsHandler, AnalyticsResolver],
  exports: [DrizzleAnalyticsRepository],
})
export class AnalyticsModule {}
