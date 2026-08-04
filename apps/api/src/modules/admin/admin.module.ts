import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';

import { AuditInterceptor } from './application/audit.interceptor';
import { DrizzleAuditRepository } from './infrastructure/drizzle-audit.repository';
import { DrizzleSystemConfigRepository } from './infrastructure/drizzle-config.repository';
import { AdminResolver } from './presentation/admin.resolver';
import { PublicBrandingResolver } from './presentation/public-branding.resolver';

@Global()
@Module({
  imports: [CqrsModule, AuthModule],
  providers: [
    DrizzleAuditRepository,
    DrizzleSystemConfigRepository,
    AuditInterceptor,
    AdminResolver,
    PublicBrandingResolver,
  ],
  exports: [DrizzleAuditRepository, DrizzleSystemConfigRepository],
})
export class AdminModule {}
