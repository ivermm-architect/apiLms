import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { idColumn, softDelete, timestamps, userStatusEnum } from './_common';

// Tabla de roles (normalizada, permite extender permisos)
export const roles = pgTable('roles', {
  id: idColumn(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps,
});

// Tabla de usuarios
export const users = pgTable(
  'users',
  {
    id: idColumn(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 60 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    // Identidad institucional. UNIQUE en Postgres admite múltiples NULL, así que
    // docentes/admin sin código conviven. documentId = CI; studentCode = matrícula.
    documentId: varchar('document_id', { length: 20 }).unique(),
    studentCode: varchar('student_code', { length: 20 }).unique(),
    avatarUrl: text('avatar_url'),
    phone: varchar('phone', { length: 30 }),
    // Cohorte académica (año de ingreso 1..2). Solo aplica a estudiantes;
    // docentes/admin quedan en null. Es el vínculo con matrícula/Personas.
    cohortYear: integer('cohort_year'),
    birthday: date('birthday'),
    profession: varchar('profession', { length: 100 }),
    bio: text('bio'),
    status: userStatusEnum('status').notNull().default('pending'),
    // True para cuentas dadas de alta con contraseña temporal: fuerza el
    // cambio en el primer login antes de dejar la cuenta operativa.
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    statusIdx: index('users_status_idx').on(t.status),
    documentIdIdx: index('users_document_id_idx').on(t.documentId),
    studentCodeIdx: index('users_student_code_idx').on(t.studentCode),
    cohortYearIdx: index('users_cohort_year_idx').on(t.cohortYear),
  }),
);

// Muchos-a-muchos usuario <-> rol
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
    userIdx: index('user_roles_user_idx').on(t.userId),
    roleIdx: index('user_roles_role_idx').on(t.roleId),
  }),
);

// Permisos granulares (opcional, para RBAC fino)
export const permissions = pgTable('permissions', {
  id: idColumn(),
  code: varchar('code', { length: 100 }).notNull().unique(), // ej: "course:create"
  description: text('description'),
  ...timestamps,
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);

// Relaciones
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
