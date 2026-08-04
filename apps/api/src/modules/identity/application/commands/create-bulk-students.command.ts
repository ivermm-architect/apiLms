import { schema, Database } from '@cieba/db';
import { generateStudentCode, generateTempPassword } from '@cieba/shared';
import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, isNull } from 'drizzle-orm';

import { DATABASE } from '../../../../core/database/database.module';
import { EnrollmentAlreadyExistsException } from '../../../../shared/exceptions/domain.exception';
import { HASHER_PORT, HasherPort } from '../../../auth/domain/ports/hasher.port';
import { EnrollCommand } from '../../../enrollment/application/commands/enroll.command';
import { USER_REPOSITORY, UserRepository } from '../../domain/ports/user.repository';

import { mapUniqueViolation } from './create-user.command';

export interface BulkStudentRow {
  firstName: string;
  lastName: string;
  email: string;
  documentId?: string;
  studentCode?: string;
  birthday?: string;
}

export class CreateBulkStudentsCommand implements ICommand {
  constructor(
    public readonly rows: BulkStudentRow[],
    public readonly cohortYear: number,
    public readonly enrollInYear: boolean,
  ) {}
}

/** Un resultado por fila para imprimir el comprobante de toda la cohorte. */
export interface BulkResult {
  email: string;
  studentCode: string | null;
  firstName: string | null;
  lastName: string | null;
  tempPassword: string | null;
  status: 'created' | 'error';
  error: string | null;
}

@CommandHandler(CreateBulkStudentsCommand)
export class CreateBulkStudentsHandler implements ICommandHandler<
  CreateBulkStudentsCommand,
  BulkResult[]
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: UserRepository,
    @Inject(HASHER_PORT) private readonly hasher: HasherPort,
    @Inject(DATABASE) private readonly db: Database,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(cmd: CreateBulkStudentsCommand): Promise<BulkResult[]> {
    // Rol student (obligatorio para el alta masiva).
    const [studentRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);
    if (!studentRole) throw new Error('Rol "student" no existe en la base de datos');

    // Materias publicadas de la cohorte (solo si se pidió matricular).
    const courseIds = cmd.enrollInYear ? await this.publishedCourseIds(cmd.cohortYear) : [];

    const results: BulkResult[] = [];
    for (const row of cmd.rows) {
      try {
        const tempPassword = generateTempPassword();
        const passwordHash = await this.hasher.hash(tempPassword);
        const studentCode = row.studentCode || generateStudentCode(cmd.cohortYear);

        const user = await this.repo.create({
          email: row.email,
          passwordHash,
          firstName: row.firstName,
          lastName: row.lastName,
          birthday: row.birthday ? new Date(row.birthday) : undefined,
          documentId: row.documentId || undefined,
          studentCode,
          // Cuenta activa: entra directo con la temporal, sin cambio forzado.
          status: 'active',
          mustChangePassword: false,
        });

        await this.repo.assignRoles(user.id, [studentRole.id]);

        if (cmd.enrollInYear) {
          await this.enrollInCourses(user.id, courseIds);
        }

        results.push({
          email: row.email,
          studentCode,
          firstName: row.firstName,
          lastName: row.lastName,
          tempPassword,
          status: 'created',
          error: null,
        });
      } catch (e) {
        // Un fallo por fila (email/CI/código duplicado) no aborta el lote.
        const mapped = mapUniqueViolation(e);
        results.push({
          email: row.email,
          studentCode: row.studentCode ?? null,
          firstName: row.firstName,
          lastName: row.lastName,
          tempPassword: null,
          status: 'error',
          error: mapped.message,
        });
      }
    }

    return results;
  }

  private async publishedCourseIds(academicYear: number): Promise<string[]> {
    const courses = await this.db
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(
        and(
          eq(schema.courses.academicYear, academicYear),
          eq(schema.courses.status, 'published'),
          isNull(schema.courses.deletedAt),
        ),
      );
    return courses.map((c) => c.id);
  }

  private async enrollInCourses(userId: string, courseIds: string[]): Promise<void> {
    for (const courseId of courseIds) {
      try {
        await this.commandBus.execute(new EnrollCommand(userId, courseId));
      } catch (e) {
        // Idempotente: si ya estaba matriculado, se salta.
        if (!(e instanceof EnrollmentAlreadyExistsException)) throw e;
      }
    }
  }
}
