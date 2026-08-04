import { createHash } from 'node:crypto';

import { CommandBus } from '@nestjs/cqrs';
import { schema, eq, type Database } from '@cieba/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CourseOwnershipService } from '../../src/core/authz/course-ownership.service';
import { LoginCommand, type LoginResult } from '../../src/modules/auth/application/commands/login.command';
import { LogoutCommand } from '../../src/modules/auth/application/commands/logout.command';
import { RefreshCommand } from '../../src/modules/auth/application/commands/refresh.command';
import type { TokenPair } from '../../src/modules/auth/domain/ports/token.port';
import { StartEvaluationCommand } from '../../src/modules/assessment/application/commands/start-evaluation.command';
import { SubmitEvaluationCommand } from '../../src/modules/assessment/application/commands/submit-evaluation.command';
import { EnrollCommand } from '../../src/modules/enrollment/application/commands/enroll.command';
import {
  EntityNotFoundException,
  EnrollmentAlreadyExistsException,
  ForbiddenDomainException,
} from '../../src/shared/exceptions/domain.exception';

import {
  bootTestHarness,
  resetDb,
  seedScenario,
  TEST_PASSWORD,
  type Scenario,
  type TestHarness,
} from './harness';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

let h: TestHarness;
let db: Database;
let bus: CommandBus;
let ownership: CourseOwnershipService;
let scn: Scenario;

beforeAll(async () => {
  h = await bootTestHarness();
  db = h.db;
  bus = h.moduleRef.get(CommandBus, { strict: false });
  ownership = h.moduleRef.get(CourseOwnershipService, { strict: false });

  await resetDb(db);
  scn = await seedScenario(db);
});

afterAll(async () => {
  await h?.close();
});

describe('AUTH (login / refresh / logout)', () => {
  it('login con credenciales válidas emite tokens y roles', async () => {
    const res = await bus.execute<LoginCommand, LoginResult>(
      new LoginCommand('admin@test.local', TEST_PASSWORD),
    );
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.email).toBe('admin@test.local');
    expect(res.user.roles).toContain('admin');
  });

  it('login con password incorrecto es rechazado', async () => {
    await expect(
      bus.execute(new LoginCommand('admin@test.local', 'wrong-password')),
    ).rejects.toThrow();
  });

  it('refresh rota el token: emite un par nuevo y revoca el anterior', async () => {
    const login = await bus.execute<LoginCommand, LoginResult>(
      new LoginCommand('student@test.local', TEST_PASSWORD),
    );

    // El `iat` del JWT tiene granularidad de segundos: esperamos >1s para que
    // el token rotado sea distinto del original (como en un uso real).
    await new Promise((r) => setTimeout(r, 1100));

    const pair = await bus.execute<RefreshCommand, TokenPair>(
      new RefreshCommand(login.refreshToken),
    );
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.refreshToken).not.toBe(login.refreshToken);

    // El refresh token original quedó revocado.
    const [oldRow] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, sha256(login.refreshToken)))
      .limit(1);
    expect(oldRow?.revokedAt).not.toBeNull();
  });

  it('logout revoca el refresh token vigente', async () => {
    const login = await bus.execute<LoginCommand, LoginResult>(
      new LoginCommand('owner.teacher@test.local', TEST_PASSWORD),
    );

    await bus.execute(new LogoutCommand(scn.ownerTeacherId, login.refreshToken));

    const [row] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, sha256(login.refreshToken)))
      .limit(1);
    expect(row?.revokedAt).not.toBeNull();
  });
});

describe('ENROLLMENT (no doble inscripción)', () => {
  it('inscribe una vez y rechaza la segunda con el mismo usuario/curso', async () => {
    const enrollment = await bus.execute(
      new EnrollCommand(scn.studentNoEnrollId, scn.courseId),
    );
    expect(enrollment.id).toBeTruthy();

    await expect(
      bus.execute(new EnrollCommand(scn.studentNoEnrollId, scn.courseId)),
    ).rejects.toBeInstanceOf(EnrollmentAlreadyExistsException);
  });
});

describe('RBAC (CourseOwnershipService)', () => {
  it('el dueño del curso pasa la verificación', async () => {
    await expect(
      ownership.assertOwnership(scn.courseId, {
        sub: scn.ownerTeacherId,
        email: 'owner.teacher@test.local',
        roles: ['teacher'],
      }),
    ).resolves.toBeUndefined();
  });

  it('un admin siempre pasa la verificación', async () => {
    await expect(
      ownership.assertOwnership(scn.courseId, {
        sub: scn.adminId,
        email: 'admin@test.local',
        roles: ['admin'],
      }),
    ).resolves.toBeUndefined();
  });

  it('otro docente (no dueño) recibe 403', async () => {
    await expect(
      ownership.assertOwnership(scn.courseId, {
        sub: scn.otherTeacherId,
        email: 'other.teacher@test.local',
        roles: ['teacher'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('curso inexistente recibe 404', async () => {
    await expect(
      ownership.assertOwnership('00000000-0000-0000-0000-000000000000', {
        sub: scn.ownerTeacherId,
        email: 'owner.teacher@test.local',
        roles: ['teacher'],
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundException);
  });
});

describe('ASSESSMENT (rendir evaluación)', () => {
  it('iniciar y enviar una evaluación aprobada califica el intento', async () => {
    const attempt = await bus.execute(
      new StartEvaluationCommand(scn.evaluationId, scn.studentId, scn.enrollmentId),
    );
    expect(attempt.id).toBeTruthy();
    expect(attempt.submittedAt).toBeNull();

    const submitted = await bus.execute(
      new SubmitEvaluationCommand(attempt.id, [
        { questionId: scn.mcQuestionId, answer: 'opt-a' },
        { questionId: scn.tfQuestionId, answer: 'true' },
      ]),
    );

    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.isPassed).toBe(true);
    expect(Number(submitted.percentage)).toBe(100);
  });
});
