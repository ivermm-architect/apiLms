export const APP_NAME = 'CIEBA LMS';
export const APP_VERSION = '0.1.0';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const BCRYPT_ROUNDS = 10;

export const JWT_ACCESS_EXPIRY_DEFAULT = '15m';
export const JWT_REFRESH_EXPIRY_DEFAULT = '7d';

// Roles estándar
export const ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

// Diccionario de permisos (code format: "resource:action").
// Fuente única de verdad: cada código mapea a la operación exacta que protege.
// Recortado a lo que el instituto usa (sin bloat de marketplace).
export const PERMISSIONS = {
  /** Wildcard. Cortocircuita cualquier chequeo de permisos (solo rol admin). */
  ADMIN_ALL: 'admin:*',
  /** catalog.resolver — alta de cursos. Admin-only vía wildcard: NO se concede a docentes (el admin gobierna la malla y asigna docente + año). */
  COURSE_CREATE: 'course:create',
  /** catalog.resolver — editar/publicar/despublicar/archivar cursos + CRUD de módulos y lecciones. */
  COURSE_MANAGE: 'course:manage',
  /** curriculum.resolver — gestión de mallas curriculares (planes de estudio versionados). Admin-only vía wildcard. */
  CURRICULUM_MANAGE: 'curriculum:manage',
  /** admin.resolver — moderación admin de CUALQUIER curso (listar todos, force-unpublish, archivar, soft-delete). Admin-only: NO se concede a docentes para evitar que moderen cursos ajenos. */
  COURSE_MODERATE: 'course:moderate',
  /** competency.resolver — CRUD de competencias y outcomes. */
  COMPETENCY_MANAGE: 'competency:manage',
  /** assessment.resolver + adaptive.resolver — quizzes, preguntas, config adaptativa, calificación. */
  EVALUATION_MANAGE: 'evaluation:manage',
  /** analytics.resolver — alerts, acknowledgeAlert (docente gestiona alertas de sus estudiantes). */
  ANALYTICS_READ: 'analytics:read',
  /** analytics.resolver — runAlertScan, adminDashboardOverview (solo admin). */
  ANALYTICS_ADMIN: 'analytics:admin',
  /** user.resolver — query user. */
  USER_READ: 'user:read',
  /** user.resolver + admin.resolver — listar/crear usuarios, gestión de estado y roles. */
  USER_MANAGE: 'user:manage',
  /** enrollment.resolver + admin.resolver — matrícula administrativa y por año. */
  ENROLLMENT_MANAGE: 'enrollment:manage',
  /** admin.resolver — gestión de roles/permisos. */
  ROLE_MANAGE: 'role:manage',
  /** admin.resolver — configuración/ajustes del sistema. */
  CONFIG_MANAGE: 'config:manage',
  /** admin.resolver — lectura de logs de auditoría. */
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Matriz rol → permisos. Fuente única para seed, login y refresh.
// Permisos ADITIVOS a roles: el roles[] del JWT no se quita (se usa en lógica de negocio).
export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  admin: [PERMISSIONS.ADMIN_ALL],
  teacher: [
    PERMISSIONS.COURSE_MANAGE,
    PERMISSIONS.COMPETENCY_MANAGE,
    PERMISSIONS.EVALUATION_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.USER_READ,
  ],
  student: [],
};
