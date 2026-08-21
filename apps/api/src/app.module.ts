import { join } from 'node:path';

import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';

import { ConfigSchema } from './core/config/env.schema';
import { CoreModule } from './core/core.module';
import { DataloaderModule } from './core/graphql/dataloader.module';
import { LoadersFactory } from './core/graphql/loaders/loaders.factory';
import { HealthModule } from './core/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { GqlThrottlerGuard } from './shared/guards/gql-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
      validate: (config) => ConfigSchema.parse(config),
    }),

    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL ?? 'info',
          transport:
            process.env.LOG_PRETTY === 'true'
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                  },
                }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'req.body.password',
              'req.body.newPassword',
              'req.body.currentPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.accessToken',
              'req.body.variables.password',
              'req.body.variables.newPassword',
              'req.body.variables.currentPassword',
              'req.body.variables.token',
              'req.body.variables.refreshToken',
              '*.password',
              '*.passwordHash',
              '*.refreshToken',
              '*.accessToken',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),

    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
      {
        // Login / refresh: 10 intentos por minuto y 30 por hora
        name: 'auth',
        ttl: 60_000,
        limit: 10,
      },
      {
        // Registro: 5 por hora por IP
        name: 'register',
        ttl: 3_600_000,
        limit: 5,
      },
    ]),

    CqrsModule.forRoot(),

    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [DataloaderModule],
      inject: [LoadersFactory],
      useFactory: (loaders: LoadersFactory) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: process.env.NODE_ENV !== 'production',
        introspection: process.env.NODE_ENV !== 'production',
        // La integración Apollo+Fastify pasa el Request como 1er arg (y reply como
        // 2º si está disponible). Posicional, no destructuring de un objeto.
        // Un juego de DataLoaders NUEVO por petición (batching + caché acotada).
        context: (request: unknown, reply: unknown) => ({
          req: request,
          res: reply,
          loaders: loaders.create(),
        }),
        formatError: (formatted) => ({
          message: formatted.message,
          code: formatted.extensions?.code ?? 'INTERNAL_ERROR',
          path: formatted.path,
        }),
      }),
    }),

    // Infraestructura
    CoreModule,
    HealthModule,

    // Bounded contexts
    AuthModule,
    IdentityModule,
    CatalogModule,
    EnrollmentModule,
    AssessmentModule,
    AnalyticsModule,
    RecommendationModule,
    AdminModule,
  ],
  // Rate limiting global: GqlThrottlerGuard adapta ThrottlerGuard al contexto
  // GraphQL sobre Fastify (parchea req.header). Los límites por operación
  // (auth/register) se aplican vía @Throttle en los resolvers.
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
