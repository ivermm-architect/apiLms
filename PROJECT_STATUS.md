# CIEBA LMS — Estado del Proyecto (backend)

> Documento verificado contra el código real (2026-07-24). Refleja el alcance
> **efectivo** de la tesis (evaluación adaptativa por competencias), no un roadmap comercial.

## Alcance

LMS con **evaluación adaptativa por competencias**. El núcleo diferencial es el motor
psicométrico (TRI/CAT/BKT) del módulo `assessment`. Se **podó** todo lo ajeno a la tesis:
`commerce`, `media`, `notification`, `ai`, `core/redis`, `core/queue`.

## Módulos (`api/apps/api/src/modules/`)

| Módulo | Responsabilidad |
| --- | --- |
| **auth** | Login/logout, refresh JWT con rotación, cambio de contraseña, perfil |
| **identity** | Usuarios, roles/RBAC, alta por admin, reset de contraseña por admin |
| **catalog** | Cursos (CRUD, publicar/despublicar/archivar), secciones, lecciones (texto-primero), **competencias**, mapeo lección→competencia |
| **enrollment** | Inscripción directa, progreso por lección, estudiantes del curso, **progreso por competencia** |
| **assessment** | Evaluaciones, banco de ítems, rendir/intentos, calificación manual, certificados, **motor adaptativo (TRI/CAT/BKT)** |
| **analytics** | Reporte estudiante/curso, alertas de riesgo, **dominio por competencia** |
| **admin** | Logs de auditoría, roles, configuración, estado de usuarios/cursos |

7 módulos de negocio.

## Motor adaptativo (`assessment/domain/adaptive/`)

| Archivo | Contenido |
| --- | --- |
| `irt.ts` | TRI 2PL: `prob2PL(theta,a,b)`, `fisherInfo(...)` |
| `cat.ts` | CAT: selección por máxima información, `estimateTheta` (EAP), criterio de parada |
| `bkt.ts` | BKT (Corbett-Anderson): `updateBKT(pKnow, correct, params)` |
| `calibration.ts` | Calibración heurística de ítems (a, b) |
| `grading.ts` | Calificación |
| `*.spec.ts` | Unit tests del motor |

## Arquitectura aplicada

- **Hexagonal**: cada módulo con `domain/` (lógica + ports) e `infrastructure/` (adapters Drizzle).
- **CQRS**: `@nestjs/cqrs` con `CommandBus`, `QueryBus`, `EventBus`.
- **EDA acotada**: 2 event handlers cross-module reales:
  - `assessment/.../issue-certificate.handler.ts` (emite certificado al completar curso).
  - `enrollment/.../on-lesson-published-recalc.handler.ts` (recalcula progreso al publicar lección).
- **DI por símbolos** (`DATABASE`, repos por token) para testabilidad.

## Stack técnico (efectivo)

| Capa | Tech |
| --- | --- |
| Runtime | Node.js + TypeScript strict |
| Framework | NestJS 10 + Fastify |
| API | GraphQL code-first + Apollo |
| ORM | Drizzle ORM |
| DB | PostgreSQL 16 |
| Auth | Passport-JWT + bcrypt + refresh tokens con rotación |
| Testing | Vitest |
| Validación | class-validator |

> No hay pgvector, Redis, colas, LLM/RAG ni pasarela de pago en el alcance actual.

## Esquema de datos (`api/packages/db/src/schema/`)

`auth` · `identity` · `catalog` · `enrollment` · `assessment` · `analytics` · `admin`
**Adaptativo**: `competency` (competencias + N:M lección/pregunta) · `adaptive` (params TRI, estimaciones θ, estados BKT, progreso por competencia)
`_common` (enums/helpers) · `index` (barrel).

32 tablas en total.

## Superficie GraphQL

- 45 queries · 57 mutations (conteo sobre decoradores `@Query`/`@Mutation`).
- Endpoint: `http://localhost:3000/graphql`.

## Credenciales demo (tras `pnpm db:seed`)

Todas con contraseña `Cieba2025!`:

- Admin: `admin@cieba.edu.bo`
- Docentes: `j.flores`, `m.rocha`, `d.gutierrez`, `p.salazar`, `c.aliaga` `@cieba.edu.bo`
- Estudiantes: `estudiante01@cieba.edu.bo` … `estudiante25@cieba.edu.bo`

## Cómo arrancar

```bash
pnpm install
pnpm docker:up        # postgres:16 en :5433
pnpm db:migrate
pnpm db:seed          # 31 usuarios, 15 cursos
pnpm dev              # api en :3000 → /graphql
```

## Verificación

- `pnpm test` → 53 unit tests verdes (motor adaptativo + handlers de comandos).
- Config: `DATABASE_URL=postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms`.
