import { randomUUID } from 'node:crypto';

import { schema, Database } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';

import { MallaType } from './dto/catalog.types';

/**
 * Gestión de mallas curriculares (planes de estudio versionados).
 * Una reforma = una nueva malla; la vigente es la única en estado `published`.
 * Distinto del "curriculum" del curso (temario/PDF). Solo admin. Auditado.
 */
@UseGuards(RolesGuard)
@Resolver(() => MallaType)
export class MallaResolver {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  /** Nº de cursos (no eliminados) colgados de cada malla, por curriculumId. */
  private async courseCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ cid: schema.courses.curriculumId, n: count() })
      .from(schema.courses)
      .where(isNull(schema.courses.deletedAt))
      .groupBy(schema.courses.curriculumId);
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.cid) map.set(r.cid, Number(r.n));
    }
    return map;
  }

  @Query(() => [MallaType])
  @RequirePermissions(PERMISSIONS.CURRICULUM_MANAGE)
  async mallas(): Promise<MallaType[]> {
    // Vigente (published) primero, luego draft, luego archived; dentro, más recientes arriba.
    const [rows, counts] = await Promise.all([
      this.db.select().from(schema.curricula).orderBy(desc(schema.curricula.createdAt)),
      this.courseCounts(),
    ]);
    const rank = (s: string): number => (s === 'published' ? 0 : s === 'draft' ? 1 : 2);
    return [...rows]
      .sort((a, b) => rank(a.status) - rank(b.status))
      .map((r) => ({
        id: r.id,
        name: r.name,
        resolution: r.resolution,
        status: r.status,
        createdAt: r.createdAt,
        courseCount: counts.get(r.id) ?? 0,
      }));
  }

  @Mutation(() => MallaType)
  @RequirePermissions(PERMISSIONS.CURRICULUM_MANAGE)
  async createMalla(
    @Args('name') name: string,
    @CurrentUser() actor: JwtPayload,
    @Args('resolution', { nullable: true }) resolution?: string,
  ): Promise<MallaType> {
    const [row] = await this.db
      .insert(schema.curricula)
      .values({ name, resolution: resolution ?? null, status: 'draft' })
      .returning();

    await this.audit
      .log({
        userId: actor.sub,
        action: 'create',
        entityType: 'malla',
        entityId: row!.id,
        metadata: { name, resolution: resolution ?? null },
      })
      .catch(() => {});

    return {
      id: row!.id,
      name: row!.name,
      resolution: row!.resolution,
      status: row!.status,
      createdAt: row!.createdAt,
      courseCount: 0, // nace vacía
    };
  }

  /**
   * Activa una malla como vigente: la marca `published` y archiva todas las demás.
   * Garantiza la invariante de una sola malla `published` a la vez.
   *
   * Reforma (clon al activar): si la malla entrante está vacía y existe una malla
   * saliente vigente, se **clonan** sus cursos (ficha: sin lecciones ni matrículas)
   * hacia la entrante con `slug` nuevo. Así el plan entrante nace poblado y el
   * saliente conserva sus cursos como histórico.
   */
  @Mutation(() => MallaType)
  @RequirePermissions(PERMISSIONS.CURRICULUM_MANAGE)
  async activateMalla(
    @Args('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<MallaType> {
    const updated = await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.curricula)
        .where(eq(schema.curricula.id, id))
        .limit(1);
      if (!target) throw new Error('Malla curricular no encontrada');

      // Malla saliente = la vigente actual, distinta de la que se activa.
      const [saliente] = await tx
        .select()
        .from(schema.curricula)
        .where(and(eq(schema.curricula.status, 'published'), ne(schema.curricula.id, id)))
        .limit(1);

      // ¿La entrante ya tiene cursos propios?
      const [own] = await tx
        .select({ n: count() })
        .from(schema.courses)
        .where(and(eq(schema.courses.curriculumId, id), isNull(schema.courses.deletedAt)));
      const targetCourses = Number(own?.n ?? 0);

      // Guard: no activar una malla vacía si no hay plan del cual clonar.
      if (targetCourses === 0 && !saliente) {
        throw new Error(
          'No puedes activar una malla vacía sin un plan vigente del cual copiar cursos.',
        );
      }

      // Clon al activar: poblar la entrante con la ficha de los cursos salientes.
      if (targetCourses === 0 && saliente) {
        const src = await tx
          .select()
          .from(schema.courses)
          .where(
            and(eq(schema.courses.curriculumId, saliente.id), isNull(schema.courses.deletedAt)),
          );
        if (src.length > 0) {
          await tx.insert(schema.courses).values(
            src.map((c) => ({
              // slug único global: sufijo corto aleatorio.
              slug: `${c.slug}-${randomUUID().slice(0, 6)}`,
              title: c.title,
              subtitle: c.subtitle,
              description: c.description,
              requirements: c.requirements,
              targetAudience: c.targetAudience,
              coverImageUrl: c.coverImageUrl,
              instructorId: c.instructorId,
              curriculumId: id,
              level: c.level,
              academicYear: c.academicYear,
              language: c.language,
              status: c.status,
              publishedAt: c.status === 'published' ? new Date() : null,
              // Clon superficial: sin lecciones ni matrículas, contadores en cero.
              durationMinutes: 0,
              totalLessons: 0,
              totalStudents: 0,
            })),
          );
        }
      }

      // Archivar el resto de mallas.
      await tx
        .update(schema.curricula)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(ne(schema.curricula.id, id));

      const [row] = await tx
        .update(schema.curricula)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(schema.curricula.id, id))
        .returning();
      return row!;
    });

    await this.audit
      .log({
        userId: actor.sub,
        action: 'update',
        entityType: 'malla',
        entityId: id,
        metadata: { activated: true },
      })
      .catch(() => {});

    const counts = await this.courseCounts();
    return {
      id: updated.id,
      name: updated.name,
      resolution: updated.resolution,
      status: updated.status,
      createdAt: updated.createdAt,
      courseCount: counts.get(updated.id) ?? 0,
    };
  }
}
