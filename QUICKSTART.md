# Quickstart — Arranque local en 5 minutos

## Pre-requisitos

- Node.js ≥ 22
- pnpm ≥ 9 (`npm i -g pnpm`)
- Docker Desktop

## Paso a paso

```bash
# 1. Entrar al directorio
cd C:\Users\IVER\Desktop\lms\code

# 2. Copiar .env
copy .env.example .env

# 3. Instalar dependencias
pnpm install

# 4. Levantar infraestructura (Postgres)
pnpm docker:up

# 5. Generar migraciones desde el schema
pnpm db:generate

# 6. Aplicar migraciones
pnpm db:migrate

# 7. Cargar datos de prueba
pnpm db:seed

# 8. Arrancar la API en modo dev
pnpm dev
```

## URLs útiles

| Servicio           | URL                                                 |
| ------------------ | --------------------------------------------------- |
| API                | http://localhost:3000                               |
| GraphQL Playground | http://localhost:3000/graphql                       |
| Health check       | http://localhost:3000/health                        |
| MinIO Console      | http://localhost:9001 (minioadmin / minioadmin_dev) |
| Mailhog UI         | http://localhost:8025                               |
| Drizzle Studio     | `pnpm db:studio` → https://local.drizzle.studio     |

## Credenciales de prueba

```
admin@uto.edu.bo    / Cieba2025!
docente@uto.edu.bo  / Cieba2025!
estudiante@uto.edu.bo / Cieba2025!
```

## Test rápido

Abre http://localhost:3000/graphql y ejecuta:

```graphql
mutation {
  login(input: { email: "admin@uto.edu.bo", password: "Cieba2025!" }) {
    accessToken
    user {
      id
      email
      roles
    }
  }
}
```

## Resolución de problemas

**Error "port already in use"**
→ Cambia los puertos en `.env` (POSTGRES_PORT, etc.)

**Drizzle no encuentra migraciones**
→ Ejecuta primero `pnpm db:generate` antes de `db:migrate`.
