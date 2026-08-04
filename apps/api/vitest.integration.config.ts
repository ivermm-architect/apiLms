import { transform } from '@swc/core';
import { defineConfig } from 'vitest/config';

// Tests de integración app-layer: arrancan el DI real de NestJS contra una BD
// de test dedicada (cieba_lms_test). No usan Apollo/Fastify.
//
// NestJS depende de la metadata de decoradores (design:paramtypes) para el DI
// por tipo (ConfigService, EventBus, Reflector...). El transform por defecto de
// Vitest (esbuild) NO la emite. Reutilizamos @swc/core —ya presente como
// devDependency y usado en runtime por @swc-node/register— vía un plugin inline
// para emitirla, sin añadir tooling nuevo.

export default defineConfig({
  // esbuild no soporta emitDecoratorMetadata; lo desactivamos y dejamos que SWC
  // sea el único transformador de los .ts del proyecto.
  esbuild: false,
  plugins: [
    {
      name: 'swc-nest-metadata',
      enforce: 'pre',
      async transform(code: string, id: string) {
        const [filepath] = id.split('?');
        if (!filepath.endsWith('.ts') || filepath.includes('node_modules')) return null;
        const result = await transform(code, {
          filename: filepath,
          sourceMaps: true,
          configFile: false,
          swcrc: false,
          jsc: {
            parser: { syntax: 'typescript', decorators: true },
            transform: {
              legacyDecorator: true,
              decoratorMetadata: true,
              useDefineForClassFields: false,
            },
            target: 'es2022',
            keepClassNames: true,
          },
          module: { type: 'es6' },
        });
        return { code: result.code, map: result.map };
      },
    },
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    setupFiles: ['test/integration/setup-reflect.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Serializado: comparten la misma BD de test.
    fileParallelism: false,
  },
});
