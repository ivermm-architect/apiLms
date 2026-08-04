# @cieba/api

Backend del LMS CIEBA. NestJS + Fastify + GraphQL + Drizzle.

## Arquitectura

**Hexagonal + CQRS + EDA**

```
┌─ Presentation ─────────────────────────────┐
│  GraphQL Resolvers │ REST Controllers       │
└──────────┬─────────────────────────────────┘
┌─ Application ──────────────────────────────┐
│  Commands │ Queries │ Event Handlers        │
│  Use Cases │ DTOs                           │
└──────────┬─────────────────────────────────┘
┌─ Domain ──────────────────────────────────-┐
│  Entities │ Aggregates │ Value Objects      │
│  Domain Events │ Ports (interfaces)         │
└──────────↑─────────────────────────────────┘
┌─ Infrastructure ──────────────────────────-┐
│  Drizzle Repos │ JWT │ Bcrypt               │
└────────────────────────────────────────────┘
```

## Módulos (Bounded Contexts)

| Módulo       | Responsabilidad                                            |
| ------------ | ---------------------------------------------------------- |
| `auth`       | Login, register, refresh, JWT, guards                      |
| `identity`   | Users, roles, permissions                                  |
| `catalog`    | Courses, sections, lessons (lista + detalle público)       |
| `enrollment` | Inscripciones, progreso por lección                        |
| `assessment` | Calificaciones, evaluaciones, intentos                     |
| `analytics`  | Reportes, alertas de riesgo                                |
| `admin`      | Auditoría, configuración del sistema                       |

## Credenciales de prueba (tras `pnpm db:seed`)

```
admin@cieba.edu.bo / Cieba2025!
docente@cieba.edu.bo / Cieba2025!
estudiante@cieba.edu.bo / Cieba2025!
```

## Probar login con GraphQL

1. Abrir `http://localhost:3000/graphql`
2. Ejecutar mutación:

```graphql
mutation Login {
  login(input: { email: "admin@cieba.edu.bo", password: "Cieba2025!" }) {
    accessToken
    refreshToken
    expiresIn
    user {
      id
      email
      roles
    }
  }
}
```

3. Usar el `accessToken` como header:

```
Authorization: Bearer <token>
```

4. Probar query autenticada:

```graphql
query Me {
  me {
    id
    email
    roles
  }
}
```

## Estructura de un módulo completo (ej: auth)

```
modules/auth/
├── domain/
│   ├── events/             # Eventos de dominio
│   └── ports/              # Interfaces (HasherPort, TokenPort, RefreshTokenRepository)
├── application/
│   ├── commands/           # Login, Register, Refresh, Logout
│   └── queries/
├── infrastructure/
│   ├── bcrypt-hasher.service.ts
│   ├── jwt-token.service.ts
│   ├── drizzle-refresh-token.repository.ts
│   ├── strategies/         # JwtStrategy (Passport)
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   └── decorators/         # @Public, @Roles, @CurrentUser
├── presentation/
│   ├── auth.resolver.ts
│   └── dto/                # GraphQL inputs/types
└── auth.module.ts
```
