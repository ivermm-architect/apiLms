# Informe de Calidad y Pruebas — CIEBA LMS

> Cierre de los Sprints 10–11 (caso de estudio). Cubre: estrategia de pruebas,
> resultados de la suite unitaria/integración, cobertura de código, prueba E2E del
> flujo crítico y evaluación de calidad según **ISO/IEC 25010**.
>
> El sistema **no** contiene motor psicométrico (TRI/CAT/BKT). Las pruebas cubren el
> flujo real: autenticación, gestión de contenido, matrículas, **evaluación estándar**,
> calificación, progreso y la capa de **IA de apoyo** (sugerencia de preguntas para el
> docente, recomendaciones e informe de aprendizaje para el estudiante).

---

## 1. Estrategia de pruebas (pirámide alineada a la arquitectura hexagonal)

La arquitectura (Puertos y Adaptadores + CQRS) determina qué se prueba y con qué
técnica, evitando duplicar esfuerzo entre capas:

| Capa (hexagonal)    | Qué contiene                                      | Técnica de prueba                                                 | Herramienta                     |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| **Dominio**         | Entidades, objetos de valor, reglas puras         | Unitaria (sin mocks de infra)                                     | Vitest                          |
| **Aplicación**      | Casos de uso (Commands/Queries)                   | Unitaria con puertos simulados                                    | Vitest + mocks                  |
| **Infraestructura** | Repos Drizzle, adaptadores LLM                    | Unitaria (adaptadores IA) + Integración (repos con Postgres real) | Vitest + harness                |
| **Presentación**    | Resolvers GraphQL, DTOs                           | Integración / E2E                                                 | Vitest integración + Playwright |
| **UI (web)**        | Server Components (fetching), componentes cliente | Unitaria (lógica/componentes) + E2E                               | Vitest + RTL / Playwright       |

**Principio:** la lógica de negocio con reglas no triviales se prueba de forma
**unitaria** (rápida, determinista); la persistencia y los resolvers se validan por
**integración** (harness con Postgres real); el recorrido de usuario se valida
**end-to-end** con Playwright. Por eso la cobertura _unitaria global_ es baja en
porcentaje: gran parte del código (repos Drizzle, resolvers) se cubre por integración
y E2E, no por pruebas unitarias.

---

## 2. Resultados de la suite (unitaria + integración)

### 2.1 Backend (`api/`) — Vitest

- **10 archivos de test · 57 pruebas · 100 % en verde.**
- Cobertura de casos de uso representativos por módulo (auth, catalog, enrollment,
  assessment, recommendation), del dominio y de los **adaptadores de IA**.

Casos cubiertos (extracto):

| Suite                                                              | Enfoque                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `recommendation/domain/recommendation.spec.ts`                     | Reglas del ranking determinista por competencias débiles                                                       |
| `recommendation/application/get-recommendations.query.spec.ts`     | Caso de uso de recomendaciones (con puertos simulados)                                                         |
| `recommendation/infrastructure/ai-cache.service.spec.ts`           | Caché _stale-while-revalidate_: HIT/MISS, dedupe, cooldown, no propaga excepciones                             |
| `recommendation/infrastructure/llm-recommender.adapter.spec.ts`    | Adaptador LLM: degradación a `[]` ante fallo/red/JSON inválido                                                 |
| `assessment/infrastructure/llm-question-suggester.adapter.spec.ts` | Sugerencia de preguntas IA: parseo, validación (1 correcta en opción múltiple), recorte a `count`, nunca lanza |
| `assessment/application/start-evaluation.command.spec.ts`          | Inicio de intento de evaluación estándar                                                                       |
| `auth/application/refresh.command.spec.ts`                         | Rotación de refresh token                                                                                      |
| `catalog/application/update-course.command.spec.ts`                | Edición de curso con verificación de propiedad                                                                 |
| `enrollment/application/enroll.command.spec.ts`                    | Matrícula (idempotencia / reglas)                                                                              |
| `core/graphql/loaders/user-roles.loader.spec.ts`                   | DataLoader de roles (batch, sin N+1)                                                                           |

- **Integración:** `test/integration/*.spec.ts` con harness (`bootTestHarness`,
  `resetDb`, `seedScenario`) sobre **PostgreSQL real** (puerto 5433) valida repos y el
  cableado CQRS de extremo a extremo del backend.

### 2.2 Frontend (`web/`) — Vitest + React Testing Library

- **4 archivos de test · 22 pruebas · 100 % en verde.**

| Suite                                        | Enfoque                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/schedule.test.ts`                       | Orden del horario (día → hora), inmutabilidad, formato de rango               |
| `lib/branding.test.ts`                       | Generación determinista de variables CSS y contraste WCAG (fg legible)        |
| `lib/graphql/derive-recent-activity.test.ts` | Derivación de actividad reciente (enrolled/progress/completed, orden, límite) |
| `components/ui-kit/course-form.test.tsx`     | Validación Zod + render de errores del formulario de curso                    |

---

## 3. Cobertura de código (v8)

Comandos: `pnpm test:cov` en `api/apps/api` y en `web/apps/web`.

### 3.1 Backend

| Ámbito                                                  | % Stmts      | % Branch | % Funcs |
| ------------------------------------------------------- | ------------ | -------- | ------- |
| Capa de negocio (dominio + aplicación + adaptadores IA) | **44.6 %**   | 78.6 %   | 66.7 %  |
| Unidades bajo prueba (SUTs)                             | **90–100 %** | —        | —       |
| Global de la app (ejecución unitaria)                   | 16.1 %       | 70.3 %   | 44.9 %  |

> El global de 16 % es esperado y **honesto**: los repos Drizzle y los resolvers
> GraphQL (la mayor parte del volumen de código) se validan por **integración**, no por
> unitarias. Las unidades efectivamente probadas están cubiertas al 90–100 %.

### 3.2 Frontend (capa de lógica de cliente + componentes con test)

| Archivo                             | % Stmts    | % Branch | % Funcs |
| ----------------------------------- | ---------- | -------- | ------- |
| `lib/schedule.ts`                   | 100 %      | 100 %    | 100 %   |
| `lib/branding.ts`                   | 90.7 %     | 87.2 %   | 95 %    |
| `components/ui-kit/course-form.tsx` | 82.3 %     | 43.6 %   | 10 %    |
| **Total del ámbito**                | **85.2 %** | 68.9 %   | 68.8 %  |

> En App Router la mayoría de la UI son **Server Components** de _fetching_, validados
> por Playwright (E2E). Vitest mide la lógica de cliente pura y los componentes
> interactivos; la capa de datos de servidor (`graphql/*`, `server-fetch`) queda fuera
> del ámbito unitario por diseño.

---

## 4. Prueba E2E del flujo crítico (Playwright)

- **Archivo:** `web/apps/web/e2e/critical-flow.spec.ts`
- **Comando:** `pnpm --filter @core-lms/web test:e2e`
- **Navegador:** Chromium · **baseURL:** `http://localhost:4200`

**Recorrido cubierto (rol estudiante, camino estándar):**

1. **Autenticación** — login (`/login`) → panel del estudiante (`/app/dashboard`).
2. **Malla curricular** — `/app/courses` ("Plan de estudios").
3. **Mis cursos** — `/app/my-courses` ("Mis cursos").
4. **Resolución de evaluación estándar** — `/app/exam/[id]`: iniciar intento, responder
   (opción múltiple / V-F / abiertas), "Enviar evaluación", pantalla de resultado
   (Aprobado / No aprobado).
5. **Consulta de calificaciones** — pestaña "Rendimiento" → "Calificaciones".
6. **Progreso con recomendaciones de IA** — panel con "Recomendado para ti" /
   "Tu informe de aprendizaje".

Selectores **semánticos** (`getByRole`, `getByText`), sin `data-testid`. Los tramos que
requieren datos sembrados (evaluación/matrícula) se activan con
`E2E_EVALUATION_ID` y `E2E_ENROLLMENT_ID`; sin ellos, esos pasos se marcan `skip`
explícito en lugar de fallar por falta de datos, de modo que el flujo base
(login → cursos → progreso) siempre es verificable.

> **Requisitos de ejecución:** API + PostgreSQL migrada y sembrada, web en `:4200`
> (Playwright la arranca si no existe), y credenciales de estudiante por env
> (`E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`). Primera vez:
> `npx playwright install chromium`.

---

## 5. Evaluación de calidad — ISO/IEC 25010

Cada característica se evalúa con una **métrica**, la **evidencia** verificable en el
repositorio y un **resultado**.

| #   | Característica              | Métrica                                                                                                     | Evidencia                                                                                                                                                            | Resultado                                            |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | **Adecuación funcional**    | Casos de uso del flujo real con prueba (auth, contenido, matrícula, evaluación, calificación, progreso, IA) | 57 pruebas backend + 22 frontend en verde; E2E del flujo crítico                                                                                                     | **Cumple** — funciones núcleo verificadas end-to-end |
| 2   | **Eficiencia de desempeño** | Ausencia de N+1; caché de IA no bloqueante                                                                  | `user-roles.loader` (DataLoader batch, test); `AiCacheService` _stale-while-revalidate_ (responde sin esperar a la IA, test de `pending`)                            | **Cumple** — respuestas inmediatas; IA en 2.º plano  |
| 3   | **Compatibilidad**          | API contractual desacoplada; tipos compartidos                                                              | Esquema GraphQL _code-first_ (`schema.gql`) consumido por Apollo Client; monorepo con tipos generados                                                                | **Cumple** — contrato único cliente/servidor         |
| 4   | **Usabilidad**              | Flujo guiado y accesible por rol                                                                            | E2E con selectores por rol/etiqueta (accesibilidad ARIA); contraste **WCAG** verificado en `branding.ts` (test)                                                      | **Cumple** — navegación por roles y contraste AA     |
| 5   | **Fiabilidad**              | Degradación controlada ante fallos de IA/red                                                                | Adaptadores LLM **nunca lanzan** (retornan `[]`/null) — tests de red/JSON/HTTP no-OK; caché con _cooldown_ ante error                                                | **Cumple** — fallo de IA no rompe la petición        |
| 6   | **Seguridad**               | Autenticación, autorización y auditoría                                                                     | JWT access+refresh con **rotación** (test `refresh.command`); RBAC (admin/teacher/student) + verificación de **propiedad** (test `update-course`); bcrypt; auditoría | **Cumple** — control de acceso probado               |
| 7   | **Mantenibilidad**          | Arquitectura por capas + suite automatizada                                                                 | Hexagonal + CQRS (dominio aislado de infra); 79 pruebas automatizadas; cobertura de negocio 90–100 % en SUTs                                                         | **Cumple** — bajo acoplamiento, alta testabilidad    |
| 8   | **Portabilidad**            | Independencia de entorno                                                                                    | Monorepo pnpm/Turborepo; config por variables de entorno (`AI_*`, `E2E_*`); Postgres en contenedor; sin dependencia de SO                                            | **Cumple** — despliegue reproducible                 |

**Síntesis:** las 8 características de ISO/IEC 25010 quedan respaldadas por evidencia
verificable (pruebas automatizadas + decisiones arquitectónicas), sin recurrir a
funcionalidad psicométrica.

---

## 6. Reproducir la evaluación

```bash
# Backend
cd api/apps/api
pnpm test          # 57 pruebas unitarias
pnpm test:cov      # + cobertura
pnpm test:integration  # repos/resolvers con Postgres real (requiere DB)

# Frontend
cd web/apps/web
pnpm test          # 22 pruebas unitarias/componentes
pnpm test:cov      # + cobertura (ámbito lógica de cliente)
pnpm test:e2e      # flujo crítico (requiere API+DB+web y credenciales)
```
