# CIEBA LMS — Backend

LMS con **evaluación adaptativa por competencias** (TRI/CAT/BKT) para el CIEBA.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: NestJS 10 + Fastify + GraphQL (code-first, Apollo)
- **ORM**: Drizzle + PostgreSQL 16
- **Auth**: JWT (access + refresh con rotación) + bcrypt
- **Testing**: Vitest
- **Arquitectura**: Hexagonal + CQRS + EDA acotada

> Alcance podado a la tesis: sin IA/RAG, sin pgvector, sin Redis/colas, sin
> storage S3, sin mail y sin pasarela de pago.

## Requisitos

- Node.js + pnpm
- Docker + Docker Compose

## Arranque local

```bash
pnpm install
pnpm docker:up        # postgres:16 en :5433
pnpm db:migrate
pnpm db:seed          # 31 usuarios, 15 cursos
pnpm dev              # api en :3000
```

API: http://localhost:3000 · GraphQL: http://localhost:3000/graphql

## Comandos útiles

```bash
pnpm dev              # Dev con watch
pnpm build            # Build producción
pnpm test             # Unit tests (53)
pnpm test:e2e         # E2E
pnpm lint             # Lint
pnpm typecheck        # TypeScript check

pnpm db:generate      # Generar migraciones desde schema
pnpm db:migrate       # Aplicar migraciones
pnpm db:push          # Push directo (solo dev)
pnpm db:seed          # Seeds
pnpm db:studio        # Drizzle Studio (GUI)

pnpm docker:up        # Levantar postgres
pnpm docker:down      # Bajar
pnpm docker:reset     # Reset completo (elimina volúmenes)
```

## Estructura

```
.
├── apps/
│   └── api/
│       └── src/
│           ├── core/        # config, database, health
│           ├── shared/      # application, domain, guards, pipes, exceptions
│           └── modules/     # bounded contexts
├── packages/
│   ├── db/                  # Drizzle schema + migrations
│   └── shared/              # tipos + validadores
└── docker-compose.yml       # postgres local
```

## Módulos (Bounded Contexts)

1. **auth** — login, refresh con rotación, cambio de contraseña, perfil
2. **identity** — usuarios, roles/RBAC, alta y reset por admin
3. **catalog** — cursos, categorías, secciones, lecciones, **competencias**
4. **enrollment** — inscripción, progreso por lección, **progreso por competencia**
5. **assessment** — evaluaciones, banco de ítems, certificados, **motor adaptativo (TRI/CAT/BKT)**
6. **analytics** — reportes, alertas de riesgo, **dominio por competencia**
7. **admin** — auditoría, roles, configuración, estado de usuarios/cursos

Ver `PROJECT_STATUS.md` para el detalle del motor adaptativo, esquema (32 tablas) y superficie GraphQL.

## Credenciales demo

Todas con `Cieba2025!`: `admin@cieba.edu.bo`, docentes (`j.flores`, `m.rocha`,
`d.gutierrez`, `p.salazar`, `c.aliaga` `@cieba.edu.bo`) y `estudiante01..25@cieba.edu.bo`.
