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

    // IA — Conexión al proveedor de modelos (API compatible con OpenAI; sirve
    // para Ollama local y OpenAI sin cambiar código). Compartida por todas las
    // funciones de IA (recomendación, sugerencia de preguntas, retroalimentación
    // e informe de aprendizaje), cada una con su propio flag de activación.
    AI_BASE_URL: z.string().default('http://localhost:11434/v1'),
    AI_API_KEY: z.string().default('ollama'),
    AI_MODEL: z.string().default('llama3.2:3b'),
    // Timeout de la llamada al modelo. Ollama local puede necesitar 30s+ en frío.
    AI_TIMEOUT_MS: z.coerce.number().default(30000),
    // IA — Explicación de recomendaciones de contenido (HIST-7), OPCIONAL e
    // independiente de la calibración. Con AI_RECOMMENDATION_ENABLED=false el
    // recomendador usa SOLO su justificación determinista (comportamiento actual).
    AI_RECOMMENDATION_ENABLED: z.coerce.boolean().default(false),
    // IA — Sugerencia de preguntas para creación de evaluaciones (B8), OPCIONAL e
    // independiente. Con AI_QUESTION_GEN_ENABLED=false la sugerencia devuelve [] y
    // el docente crea preguntas manualmente (comportamiento idéntico a hoy).
    AI_QUESTION_GEN_ENABLED: z.coerce.boolean().default(false),
    // IA — Sugerencia de retroalimentación al calificar respuestas abiertas (B9),
    // OPCIONAL e independiente. Con AI_FEEDBACK_ENABLED=false devuelve null y el
    // docente escribe la retroalimentación manualmente (comportamiento idéntico).
    AI_FEEDBACK_ENABLED: z.coerce.boolean().default(false),
    // IA — Informe de aprendizaje del estudiante (tesis §2.9), OPCIONAL e
    // independiente. Con AI_LEARNING_REPORT_ENABLED=false el informe devuelve
    // generated=false y la UI lo oculta (degradación elegante). La IA solo
    // REDACTA a partir de hechos reales (avance + promedios); no calcula ni
    // muestra cifras psicométricas (θ, error estándar ni % de dominio).
    AI_LEARNING_REPORT_ENABLED: z.coerce.boolean().default(false),
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
