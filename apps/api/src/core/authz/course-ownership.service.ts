import { Database, schema } from '@cieba/db';
import { JwtPayload } from '@cieba/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  EntityNotFoundException,
  ForbiddenDomainException,
} from '../../shared/exceptions/domain.exception';
import { DATABASE } from '../database/database.module';

/**
 * Verificación de propiedad de curso centralizada (RBAC a nivel de recurso).
 * Antes estaba duplicada como método privado `assertCourseOwnership` en varios
 * resolvers (catalog, competency, assessment), cada uno con acceso directo a
 * `db` y lanzando `Error` crudo (que el filtro mapeaba a 500).
 * Aquí lanza excepciones de dominio con statusCode correcto (404 / 403).
 */
@Injectable()
export class CourseOwnershipService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async assertOwnership(courseId: string, user: JwtPayload): Promise<void> {
    if (user.roles.includes('admin')) return;
    const [row] = await this.db
      .select({ instructorId: schema.courses.instructorId })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .limit(1);
    if (!row) throw new EntityNotFoundException('Curso', courseId);
    if (row.instructorId !== user.sub) {
      throw new ForbiddenDomainException('No autorizado: este curso no te pertenece');
    }
  }
}
