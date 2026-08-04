import { Database } from '@cieba/db';
import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';

import { DATABASE } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.checkDatabase()]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { database: { status: 'up' } };
    } catch (err) {
      return { database: { status: 'down', message: (err as Error).message } };
    }
  }
}
