# Documentación Técnica — CIEBA LMS

> **Alcance del documento (HIST-11):** arquitectura del sistema y referencia de la
> API GraphQL. Documento generado a partir del código fuente real
> (`apps/api/src/schema.gql` y la estructura de módulos). No incluye capturas de
> pantalla; las figuras se añaden en el documento de tesis.

**Sistema:** Plataforma de gestión de aprendizaje (LMS) para el CIEBA.
**Fecha de referencia:** sprint 11–12 (validación y despliegue).

---

## 1. Visión general

CIEBA LMS es una plataforma web para la gestión de cursos, evaluaciones,
calificaciones y seguimiento del progreso académico de estudiantes de enfermería.
El sistema soporta tres roles —**estudiante**, **docente** y **administrador**— y
ofrece apoyo por **Inteligencia Artificial** (redacción de informes de aprendizaje,
recomendación de cursos, sugerencia de preguntas y retroalimentación de respuestas
abiertas) de forma **opcional y con degradación elegante**: si la IA no está
disponible, el sistema sigue operando con lógica determinista.

El sistema **no** utiliza motor psicométrico adaptativo (TRI/CAT/BKT/IRT). Las
evaluaciones usan dificultad simple (`easy` / `medium` / `hard`) y el progreso se
mide por porcentaje de lecciones completadas y calificaciones.

---

## 2. Stack tecnológico

### Backend (`api/`)

| Componente    | Tecnología                                   | Versión         |
| ------------- | -------------------------------------------- | --------------- |
| Lenguaje      | TypeScript                                   | ^5.6            |
| Framework     | NestJS                                       | ^10.4           |
| API           | GraphQL code-first (Apollo Server)           | ^12.2 / ^4.11   |
| Patrón CQRS   | `@nestjs/cqrs`                               | ^10.2           |
| ORM           | Drizzle ORM                                  | ^0.36           |
| Base de datos | PostgreSQL                                   | 16              |
| Autenticación | JWT (access + refresh con rotación) + bcrypt | passport-jwt ^4 |
| Validación    | Zod                                          | ^3.23           |
| Pruebas       | Vitest                                       | —               |

### Frontend (`web/`)

| Componente      | Tecnología           | Versión   |
| --------------- | -------------------- | --------- |
| Framework       | Next.js (App Router) | ^15       |
| UI              | React                | ^19       |
| Cliente GraphQL | Apollo Client        | ^3.11     |
| Estilos         | Tailwind CSS         | ^4 (beta) |
| Pruebas E2E     | Playwright           | ^1.62     |

### Infraestructura

- **Monorepo:** pnpm workspaces + Turborepo (repos separados `api/` y `web/`).
- **Contenedores:** Docker Compose (PostgreSQL 16 en el puerto `5433`).
- **Capa de IA:** servidor compatible con la API de OpenAI (`/v1/chat/completions`),
  desplegable con **Ollama** local o cualquier proveedor OpenAI-compatible.

---

## 3. Arquitectura del backend

El backend aplica **Arquitectura Hexagonal (Puertos y Adaptadores)** combinada con
**CQRS** (separación de comandos y consultas) sobre una organización por
**bounded contexts** (contextos acotados).

### 3.1. Organización de carpetas

```
apps/api/src/
├── core/            # configuración, base de datos, health checks
├── shared/          # base de application/domain, guards, pipes, excepciones
└── modules/         # bounded contexts (8)
    ├── auth/
    ├── identity/
    ├── catalog/
    ├── enrollment/
    ├── assessment/
    ├── analytics/
    ├── recommendation/
    └── admin/

packages/
├── db/              # esquema Drizzle + migraciones SQL
└── shared/          # tipos y validadores compartidos
```

### 3.2. Capas dentro de cada módulo

```
modules/<contexto>/
├── domain/          # entidades, reglas de negocio y PUERTOS (interfaces)
│   └── ports/       # contratos que la aplicación necesita
├── application/     # casos de uso: Commands (escritura) y Queries (lectura)
├── infrastructure/  # ADAPTADORES: repositorios Drizzle, adaptadores LLM
└── presentation/    # resolvers GraphQL + DTOs (types/inputs)
```

**Flujo de una petición (lectura):**

```
Cliente GraphQL
   │  query
   ▼
Resolver (presentation) ──▶ QueryBus ──▶ QueryHandler (application)
                                              │
                                              ├──▶ Puerto de repositorio (domain)
                                              │        └─▶ Adaptador Drizzle (infrastructure) ─▶ PostgreSQL
                                              └──▶ Puerto de IA (domain, opcional)
                                                       └─▶ Adaptador LLM (infrastructure) ─▶ Ollama/OpenAI
```

Los **puertos** (interfaces del dominio) desacoplan la lógica de negocio de la
tecnología concreta: la aplicación depende de abstracciones, y la infraestructura
provee las implementaciones (repositorios y adaptadores de IA). Esto permite
sustituir el proveedor de IA o la base de datos sin tocar los casos de uso.

### 3.3. Contextos acotados (bounded contexts)

| #   | Módulo             | Responsabilidad                                                                                                                                               |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **auth**           | Inicio de sesión, refresh con rotación de tokens, cambio de contraseña, perfil, sesiones activas.                                                             |
| 2   | **identity**       | Usuarios, roles y permisos (RBAC), alta individual y masiva de estudiantes, reset por administrador.                                                          |
| 3   | **catalog**        | Cursos, secciones, lecciones, competencias, mallas curriculares, asignación de docentes.                                                                      |
| 4   | **enrollment**     | Inscripciones, progreso por lección, horarios de curso.                                                                                                       |
| 5   | **assessment**     | Evaluaciones, preguntas (opción múltiple, V/F, abiertas), intentos, calificación; **IA:** sugerencia de preguntas y retroalimentación de respuestas abiertas. |
| 6   | **analytics**      | Reportes de docente/cohorte, estadísticas de tablero, alertas de riesgo académico por reglas.                                                                 |
| 7   | **recommendation** | **IA:** recomendación de cursos e informe de aprendizaje redactado en lenguaje natural (con caché no bloqueante).                                             |
| 8   | **admin**          | Auditoría, gestión de roles, configuración de plataforma, estado de usuarios y cursos.                                                                        |

---

## 4. Seguridad y control de acceso

- **Autenticación JWT:** par _access token_ (corta duración) + _refresh token_ con
  **rotación** en cada renovación. Las contraseñas se almacenan con **bcrypt**.
- **RBAC:** cada usuario tiene uno o más roles (`admin`, `teacher`, `student`) y los
  roles agrupan permisos. Los resolvers protegidos verifican rol/permiso.
- **Ownership:** las operaciones de docente validan la propiedad del curso
  (un docente solo administra sus propios cursos).
- **Auditoría:** las acciones sensibles quedan registradas (`auditLogs`) con actor,
  entidad, severidad, IP y user-agent.

---

## 5. Capa de Inteligencia Artificial

La IA se integra por **composición** mediante puertos del dominio; nunca es una
dependencia dura. Se controla con banderas de entorno (`AI_*_ENABLED`).

| Función                 | Query/Mutation               | Módulo         | Flag                         |
| ----------------------- | ---------------------------- | -------------- | ---------------------------- |
| Recomendación de cursos | `myRecommendations`          | recommendation | `AI_RECOMMENDATION_ENABLED`  |
| Informe de aprendizaje  | `myLearningReport`           | recommendation | `AI_LEARNING_REPORT_ENABLED` |
| Sugerir preguntas       | `suggestEvaluationQuestions` | assessment     | `AI_QUESTION_GEN_ENABLED`    |
| Feedback de abierta     | `suggestOpenAnswerFeedback`  | assessment     | `AI_FEEDBACK_ENABLED`        |

**Caché no bloqueante (stale-while-revalidate):** para recomendaciones e informe de
aprendizaje, el backend responde **al instante** desde caché en memoria y **regenera
en segundo plano** (con deduplicación de peticiones concurrentes y _cooldown_ ante
fallos). El campo `pending` de `LearningReportType` indica a la UI que muestre el
estado "generando…" y se refresque sola cuando el texto esté listo. Así la latencia
del modelo de lenguaje no bloquea la carga del tablero.

**Variables de entorno de IA:**

```
AI_BASE_URL=http://localhost:11434/v1     # endpoint OpenAI-compatible (Ollama)
AI_API_KEY=ollama
AI_MODEL=qwen-libre:latest
AI_TIMEOUT_MS=120000
AI_RECOMMENDATION_ENABLED=true
AI_LEARNING_REPORT_ENABLED=true
AI_QUESTION_GEN_ENABLED=true
AI_FEEDBACK_ENABLED=true
```

---

## 6. Referencia de la API GraphQL

API **code-first** servida en `POST /graphql`. Todos los tipos se generan
automáticamente en `apps/api/src/schema.gql`. A continuación se agrupan las
operaciones por área funcional (contexto acotado). Los tipos de retorno completos
están definidos en el esquema.

### 6.1. Autenticación y perfil (auth)

**Queries**

| Operación    | Firma        | Retorno         |
| ------------ | ------------ | --------------- |
| `me`         | `me`         | `AuthUserType`  |
| `mySessions` | `mySessions` | `[SessionType]` |

**Mutations**

| Operación        | Firma                                         | Retorno           |
| ---------------- | --------------------------------------------- | ----------------- |
| `login`          | `login(input: LoginInput!)`                   | `AuthPayloadType` |
| `refresh`        | `refresh(input: RefreshInput!)`               | `TokenPairType`   |
| `logout`         | `logout(refreshToken, allDevices)`            | `Boolean`         |
| `changePassword` | `changePassword(input: ChangePasswordInput!)` | `Boolean`         |
| `updateProfile`  | `updateProfile(input: UpdateProfileInput!)`   | `AuthUserType`    |
| `revokeSession`  | `revokeSession(id: String!)`                  | `Boolean`         |

### 6.2. Identidad y usuarios (identity)

**Queries:** `users(input)`, `user(id)`, `roles`, `userEnrollments(userId)`.

**Mutations:** `createUser(input)`, `updateUser(id, input)`, `bulkCreateStudents(input)`,
`assignRole(userId, roleName)`, `revokeRole(userId, roleName)`, `setUserStatus(userId, status)`.

### 6.3. Catálogo: cursos, lecciones, competencias (catalog)

**Queries:** `courses(input)`, `course(slug)`, `courseSections(courseId)`,
`sectionLessons(sectionId)`, `courseCompetencies(courseId)`, `lessonCompetencies(lessonId)`,
`myInstructorCourses(status)`, `topInstructors(limit)`, `mallas`.

**Mutations:**

- Cursos: `createCourse`, `updateCourse`, `publishCourse`, `unpublishCourse`,
  `archiveCourse`, `assignCourseInstructor`.
- Estructura: `createSection`, `updateSection`, `deleteSection`, `reorderSections`,
  `createLesson`, `updateLesson`, `deleteLesson`, `reorderLessons`.
- Competencias: `createCompetency`, `updateCompetency`, `deleteCompetency`,
  `linkLessonCompetency`, `unlinkLessonCompetency`, `linkQuestionCompetency`,
  `unlinkQuestionCompetency`.
- Mallas: `createMalla`, `activateMalla`.

### 6.4. Inscripciones y horarios (enrollment)

**Queries:** `myEnrollments`, `courseStudents(courseId)`, `mySchedule`, `allSchedules`,
`courseSchedules(courseId)`, `courseScheduleBlocks(courseId)`.

**Mutations:** `trackLessonView(input)`, `createSchedule`, `updateSchedule`, `deleteSchedule`.

### 6.5. Evaluación y calificación (assessment)

**Queries:** `courseEvaluations(courseId)`, `evaluation(id)`, `evaluationQuestions(evaluationId)`,
`evaluationQuestionsForOwner(evaluationId)`, `myEvaluationAttempts(evaluationId)`,
`coursePendingAnswers(courseId)`, `myGrades(courseId)`,
`suggestEvaluationQuestions(input)` _(IA)_, `suggestOpenAnswerFeedback(answerId)` _(IA)_.

**Mutations:** `createEvaluation`, `deleteEvaluation`, `addEvaluationQuestion`,
`deleteEvaluationQuestion`, `startEvaluation`, `submitEvaluation`,
`gradeOpenAnswer(answerId, points, feedback)`, `gradeStudent(input)`.

### 6.6. Analítica y alertas (analytics)

**Queries:** `instructorAnalytics`, `instructorDashboardStats(cohortYear)`,
`instructorAtRiskStudents`, `cohortReport`, `myCourseReport(courseId)`,
`studentReport(courseId, studentId)`, `alerts(courseId)`.

**Mutations:** `runAlertScan`, `acknowledgeAlert(id)`.

> **Alertas de riesgo por reglas:** la señal de riesgo se calcula por reglas
> (inactividad, calificaciones bajas, entregas pendientes) —campos `reasons`,
> `inactive`, `pendingCount`, `lastActivityAt` de `InstructorAtRiskStudentType`—
> sin modelo psicométrico.

### 6.7. Recomendación e informe de aprendizaje (recommendation)

**Queries:** `myRecommendations(limit)` → `[RecommendedCourseType]` _(IA opcional)_,
`myLearningReport` → `LearningReportType` _(IA opcional, con `pending`)_.

### 6.8. Administración (admin)

**Queries:** `adminDashboardOverview`, `adminCourses(...)`, `adminUsers(...)`,
`auditLogs(entityType, userId)`, `getConfig(key)`, `publicBranding`.

**Mutations:** `setConfig(key, value)`, `adminEnrollStudentInYear(input)`,
`adminArchiveCourse(id)`, `adminSoftDeleteCourse(id)`, `adminUnenroll(enrollmentId)`.

---

## 7. Persistencia y migraciones

- **ORM:** Drizzle ORM sobre PostgreSQL 16. El esquema vive en
  `packages/db/src/schema/` y las migraciones SQL versionadas en
  `packages/db/drizzle/`.
- **Generación:** `pnpm db:generate` crea la migración a partir del cambio de
  esquema; `pnpm db:migrate` la aplica.
- **Seeds:** `pnpm db:seed` carga datos de demostración (usuarios, cursos,
  inscripciones) para pruebas y demostración.

**Comandos de base de datos:**

```bash
pnpm db:generate   # generar migración desde el esquema
pnpm db:migrate    # aplicar migraciones pendientes
pnpm db:seed       # cargar datos de demostración
pnpm db:studio     # explorador visual (Drizzle Studio)
```

---

## 8. Calidad y verificación

| Comando          | Propósito                          |
| ---------------- | ---------------------------------- |
| `pnpm typecheck` | Verificación de tipos (TypeScript) |
| `pnpm lint`      | Análisis estático (ESLint)         |
| `pnpm test`      | Pruebas unitarias (Vitest)         |
| `pnpm test:e2e`  | Pruebas de extremo a extremo       |
| `pnpm build`     | Compilación de producción          |

Las reglas de negocio del dominio (cálculo de progreso, recomendación determinista,
reglas de alerta) están cubiertas por pruebas unitarias. El flujo crítico de usuario
(login → curso → evaluación → calificación) se valida con pruebas E2E (Playwright).

---

## 9. Arranque local (referencia)

```bash
# Backend
pnpm install
pnpm docker:up        # PostgreSQL 16 en :5433
pnpm db:migrate
pnpm db:seed
pnpm dev              # API en :3000 · GraphQL en :3000/graphql

# Frontend (repo web/)
pnpm install
pnpm dev              # Next.js en :4200
```

**Credenciales de demostración** (contraseña `Cieba2025!`):
`admin@cieba.edu.bo`, docentes `@cieba.edu.bo`, `estudiante01..25@cieba.edu.bo`.
