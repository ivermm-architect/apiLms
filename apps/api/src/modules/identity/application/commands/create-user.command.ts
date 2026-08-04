import { schema, Database, User } from '@cieba/db';
import { generateStudentCode, generateTempPassword } from '@cieba/shared';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { inArray } from 'drizzle-orm';

import { DATABASE } from '../../../../core/database/database.module';
import { ConflictDomainException } from '../../../../shared/exceptions/domain.exception';
import { HASHER_PORT, HasherPort } from '../../../auth/domain/ports/hasher.port';
import { USER_REPOSITORY, UserRepository } from '../../domain/ports/user.repository';

export class CreateUserCommand implements ICommand {
  constructor(
    public readonly input: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      birthday?: string;
      profession?: string;
      documentId?: string;
      studentCode?: string;
      cohortYear?: number;
      roleIds?: string[];
    },
  ) {}
}

/** El alta genera la contraseña temporal y la devuelve UNA vez para el comprobante. */
export interface CreateUserResult {
  user: User;
  tempPassword: string;
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, CreateUserResult> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: UserRepository,
    @Inject(HASHER_PORT) private readonly hasher: HasherPort,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async execute(cmd: CreateUserCommand): Promise<CreateUserResult> {
    const exists = await this.repo.findByEmail(cmd.input.email);
    if (exists) throw new ConflictDomainException('Email ya registrado');

    // El sistema genera la contraseña temporal (nunca la teclea el admin).
    const tempPassword = generateTempPassword();
    const passwordHash = await this.hasher.hash(tempPassword);

    // Deriva el código de matrícula si el alta es de un estudiante y no se
    // proveyó uno propio del instituto.
    const studentCode = await this.resolveStudentCode(cmd.input);

    let user: User;
    try {
      user = await this.repo.create({
        email: cmd.input.email,
        passwordHash,
        firstName: cmd.input.firstName,
        lastName: cmd.input.lastName,
        phone: cmd.input.phone,
        birthday: cmd.input.birthday ? new Date(cmd.input.birthday) : undefined,
        profession: cmd.input.profession,
        documentId: cmd.input.documentId ?? undefined,
        studentCode: studentCode ?? undefined,
        // Alta institucional: la cuenta queda activa y entra directo con la
        // contraseña temporal del comprobante (sin cambio forzado en el 1er login).
        status: 'active',
        mustChangePassword: false,
      });
    } catch (e) {
      throw mapUniqueViolation(e);
    }

    if (cmd.input.roleIds && cmd.input.roleIds.length > 0) {
      await this.repo.assignRoles(user.id, cmd.input.roleIds);
    }

    return { user, tempPassword };
  }

  /**
   * Devuelve el código de matrícula a persistir:
   * - Si el admin lo proveyó, se respeta.
   * - Si no, y alguno de los roles asignados es `student`, se deriva de la cohorte.
   * - En cualquier otro caso (docente/admin), null.
   */
  private async resolveStudentCode(input: CreateUserCommand['input']): Promise<string | null> {
    if (input.studentCode) return input.studentCode;
    if (!input.roleIds || input.roleIds.length === 0) return null;

    const roleRows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.roles)
      .where(inArray(schema.roles.id, input.roleIds));

    const isStudent = roleRows.some((r) => r.name === 'student');
    if (!isStudent) return null;

    const cohortYear = input.cohortYear ?? new Date().getFullYear();
    return generateStudentCode(cohortYear);
  }
}

/**
 * Traduce una violación de UNIQUE de Postgres (código 23505) en una excepción
 * de dominio con mensaje legible, para no propagar un 500 al cliente. Cualquier
 * otro error se re-lanza tal cual.
 */
export function mapUniqueViolation(e: unknown): Error {
  const err = e as { code?: string; constraint_name?: string };
  if (err?.code === '23505') {
    const c = err.constraint_name ?? '';
    if (c.includes('email')) return new ConflictDomainException('Email ya registrado');
    if (c.includes('document_id')) return new ConflictDomainException('CI ya registrado');
    if (c.includes('student_code'))
      return new ConflictDomainException('Código de matrícula ya registrado');
    return new ConflictDomainException('Registro duplicado');
  }
  return e as Error;
}
