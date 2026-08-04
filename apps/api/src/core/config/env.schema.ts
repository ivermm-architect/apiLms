import { z } from 'zod';

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // API
    API_PORT: z.coerce.number().default(3000),
    API_HOST: z.string().default('0.0.0.0'),
    API_CORS_ORIGIN: z.string().default('http://localhost:4200'),
    API_GLOBAL_PREFIX: z.string().default('api'),
    FRONTEND_URL: z.string().url().default('http://localhost:4200'),

    // Database
    DATABASE_URL: z.string().url(),

    // JWT
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().default(10),

    // Throttler
    THROTTLE_TTL: z.coerce.number().default(60),
    THROTTLE_LIMIT: z.coerce.number().default(100),

    // Logging
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    LOG_PRETTY: z.coerce.boolean().default(false),

    // Sentry
    SENTRY_DSN: z.string().optional(),

    // IA — Inicialización asistida de parámetros IRT (cold-start), OPCIONAL.
    // Con AI_CALIBRATION_ENABLED=false el sistema se comporta EXACTAMENTE como hoy.
    // API compatible con OpenAI (sirve para Ollama local y OpenAI sin cambiar código).
    AI_CALIBRATION_ENABLED: z.coerce.boolean().default(false),
    AI_BASE_URL: z.string().default('http://localhost:11434/v1'),
    AI_API_KEY: z.string().default('ollama'),
    AI_MODEL: z.string().default('llama3.2:3b'),
    // Timeout de la llamada al modelo. Ollama local puede necesitar 30s+ en frío.
    AI_TIMEOUT_MS: z.coerce.number().default(30000),
  })
  .superRefine((cfg, ctx) => {
    // En producción, rechazamos secretos de desarrollo para fallar rápido en boot
    // en lugar de arrancar con credenciales JWT débiles.
    if (cfg.NODE_ENV !== 'production') return;

    const weakSecret = (s: string) => s.includes('dev_') || s.includes('change_in_production');
    if (weakSecret(cfg.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Secret de desarrollo detectado en producción',
      });
    }
    if (weakSecret(cfg.JWT_REFRESH_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Secret de desarrollo detectado en producción',
      });
    }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;
