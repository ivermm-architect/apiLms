import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { LoginHandler } from './application/commands/login.command';
import { LogoutHandler } from './application/commands/logout.command';
import { RefreshHandler } from './application/commands/refresh.command';
import { HASHER_PORT } from './domain/ports/hasher.port';
import { REFRESH_TOKEN_REPOSITORY } from './domain/ports/refresh-token.repository';
import { TOKEN_PORT } from './domain/ports/token.port';
import { BcryptHasherService } from './infrastructure/bcrypt-hasher.service';
import { DrizzleRefreshTokenRepository } from './infrastructure/drizzle-refresh-token.repository';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { PermissionsGuard } from './infrastructure/guards/permissions.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthResolver } from './presentation/auth.resolver';

const CommandHandlers = [LoginHandler, RefreshHandler, LogoutHandler];

@Module({
  imports: [
    ConfigModule,
    CqrsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  providers: [
    // Strategies
    JwtStrategy,

    // Ports → Adapters
    { provide: HASHER_PORT, useClass: BcryptHasherService },
    { provide: TOKEN_PORT, useClass: JwtTokenService },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: DrizzleRefreshTokenRepository },

    // CQRS Handlers
    ...CommandHandlers,

    // Resolvers
    AuthResolver,

    // Guards globales
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [HASHER_PORT, TOKEN_PORT],
})
export class AuthModule {}
