import 'reflect-metadata';

import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { schema, sql, type Database } from '@cieba/db';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { ConfigSchema } from '../../src/core/config/env.schema';
import { CoreModule } from '../../src/core/core.module';
import { DATABASE } from '../../src/core/database/database.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { EnrollmentModule } from '../../src/modules/enrollment/enrollment.module';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms_test';

export const TEST_PASSWORD = 'Cieba2025!';

export interface TestHarness {
  moduleRef: TestingModule;
  db: Database;
  close: () => Promise<void>;
}

/**
 * Arranca el contenedor DI real de NestJS (Auth + Enrollment + Assessment)
 * apuntando a la BD de test. No monta Apollo/Fastify: los tests ejercen
 * commands/servicios/repos directamente vía CommandBus/EventBus.
 */
export async function bootTestHarness(): Promise<TestHarness> {
  const client = postgres(TEST_DATABASE_URL, { max: 5, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Database;

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        cache: true,
        envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
        validate: (config) => ConfigSchema.parse(config),
      }),
      CqrsModule.forRoot(),
      CoreModule,
      AuthModule,
      AdminModule, // @Global: provee DrizzleAuditRepository requerido por EnrollmentResolver
      EnrollmentModule,
      AssessmentModule,
    ],
  })
    .overrideProvider(DATABASE)
    .useValue(db)
    .compile();

  // Dispara onApplicationBootstrap → CqrsModule enlaza los handlers al bus.
  await moduleRef.init();

  return {
    moduleRef,
    db,
    close: async () => {
      await moduleRef.close();
      await client.end();
    },
  };
}

/** Vacía las tablas de dominio para partir de un estado limpio y determinista. */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      evaluation_answers,
      evaluation_attempts,
      evaluation_questions,
      evaluations,
      grades,
      lesson_progress,
      enrollments,
      lessons,
      sections,
      courses,
      refresh_tokens,
      user_roles,
      users,
      roles
    RESTART IDENTITY CASCADE
  `);
}

export interface Scenario {
  roleIds: { admin: string; teacher: string; student: string };
  ownerTeacherId: string;
  otherTeacherId: string;
  adminId: string;
  studentId: string; // inscrito en el curso
  studentNoEnrollId: string; // sin inscripción (para probar doble-inscripción)
  courseId: string;
  enrollmentId: string;
  evaluationId: string;
  mcQuestionId: string; // opción correcta = 'opt-a'
  tfQuestionId: string; // correctAnswer = 'true'
}

/**
 * Siembra un escenario mínimo y determinista para los tests.
 * Passwords reales bcrypt para que LoginCommand funcione de extremo a extremo.
 */
export async function seedScenario(db: Database): Promise<Scenario> {
  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

  const [adminRole, teacherRole, studentRole] = await db
    .insert(schema.roles)
    .values([{ name: 'admin' }, { name: 'teacher' }, { name: 'student' }])
    .returning({ id: schema.roles.id, name: schema.roles.name });

  const [owner, other, admin, student, studentNoEnroll] = await db
    .insert(schema.users)
    .values([
      {
        email: 'owner.teacher@test.local',
        passwordHash,
        firstName: 'Owner',
        lastName: 'Teacher',
        status: 'active',
      },
      {
        email: 'other.teacher@test.local',
        passwordHash,
        firstName: 'Other',
        lastName: 'Teacher',
        status: 'active',
      },
      {
        email: 'admin@test.local',
        passwordHash,
        firstName: 'Ada',
        lastName: 'Admin',
        status: 'active',
      },
      {
        email: 'student@test.local',
        passwordHash,
        firstName: 'Stu',
        lastName: 'Dent',
        status: 'active',
      },
      {
        email: 'student.free@test.local',
        passwordHash,
        firstName: 'Free',
        lastName: 'Student',
        status: 'active',
      },
    ])
    .returning({ id: schema.users.id, email: schema.users.email });

  await db.insert(schema.userRoles).values([
    { userId: owner!.id, roleId: teacherRole!.id },
    { userId: other!.id, roleId: teacherRole!.id },
    { userId: admin!.id, roleId: adminRole!.id },
    { userId: student!.id, roleId: studentRole!.id },
    { userId: studentNoEnroll!.id, roleId: studentRole!.id },
  ]);

  const [course] = await db
    .insert(schema.courses)
    .values({
      slug: 'curso-test',
      title: 'Curso de Test',
      description: 'Curso para pruebas de integración',
      instructorId: owner!.id,
      status: 'published',
    })
    .returning({ id: schema.courses.id });

  const [enrollment] = await db
    .insert(schema.enrollments)
    .values({ userId: student!.id, courseId: course!.id, status: 'active' })
    .returning({ id: schema.enrollments.id });

  const [evaluation] = await db
    .insert(schema.evaluations)
    .values({
      courseId: course!.id,
      createdBy: owner!.id,
      title: 'Quiz de Test',
      difficulty: 'easy',
      passingScore: '60',
      maxAttempts: 3,
    })
    .returning({ id: schema.evaluations.id });

  const [mc, tf] = await db
    .insert(schema.evaluationQuestions)
    .values([
      {
        evaluationId: evaluation!.id,
        questionText: '¿2 + 2?',
        questionType: 'multiple_choice',
        options: [
          { id: 'opt-a', text: '4', isCorrect: true },
          { id: 'opt-b', text: '5', isCorrect: false },
        ],
        points: '1',
        position: 0,
      },
      {
        evaluationId: evaluation!.id,
        questionText: 'El cielo es azul.',
        questionType: 'true_false',
        correctAnswer: 'true',
        points: '1',
        position: 1,
      },
    ])
    .returning({ id: schema.evaluationQuestions.id });

  return {
    roleIds: { admin: adminRole!.id, teacher: teacherRole!.id, student: studentRole!.id },
    ownerTeacherId: owner!.id,
    otherTeacherId: other!.id,
    adminId: admin!.id,
    studentId: student!.id,
    studentNoEnrollId: studentNoEnroll!.id,
    courseId: course!.id,
    enrollmentId: enrollment!.id,
    evaluationId: evaluation!.id,
    mcQuestionId: mc!.id,
    tfQuestionId: tf!.id,
  };
}
