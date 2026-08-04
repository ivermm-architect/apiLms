// Los decoradores de NestJS emiten llamadas a Reflect.metadata en tiempo de
// evaluación del módulo. reflect-metadata debe cargarse antes que cualquier
// clase decorada. Vitest ejecuta este setup antes de importar los tests.
import 'reflect-metadata';
