import 'reflect-metadata';

import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/exceptions/all-exceptions.filter';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // Middlewares de seguridad (Fastify plugins). Se registran sobre la instancia
  // Fastify nativa: su firma `register` es la que estos plugins tipan de origen,
  // a diferencia del `register` abstracto de NestFastifyApplication.
  const fastify = app.getHttpAdapter().getInstance();
  const isProd = process.env.NODE_ENV === 'production';
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  });
  await fastify.register(fastifyCompress);
  await fastify.register(fastifyCookie, {
    secret: process.env.JWT_REFRESH_SECRET,
  });
  await fastify.register(fastifyCors, {
    origin: (process.env.API_CORS_ORIGIN ?? 'http://localhost:4200').split(','),
    credentials: true,
    maxAge: 3600,
  });

  // Prefijo global + versionado
  app.setGlobalPrefix(process.env.API_GLOBAL_PREFIX ?? 'api', {
    exclude: ['/', '/health', '/graphql'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Pipes globales
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtro global de excepciones
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '0.0.0.0';

  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(`🚀 API running on http://${host}:${port}`);
  logger.log(`📊 GraphQL Playground on http://${host}:${port}/graphql`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});
