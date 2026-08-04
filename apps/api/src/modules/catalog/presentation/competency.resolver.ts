import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { NotFoundException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CourseOwnershipService } from '../../../core/authz/course-ownership.service';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { DrizzleCompetencyRepository } from '../infrastructure/drizzle-competency.repository';

import {
  CompetencyType,
  CreateCompetencyInput,
  UpdateCompetencyInput,
} from './dto/competency.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class CompetencyResolver {
  constructor(
    private readonly repo: DrizzleCompetencyRepository,
    private readonly courseOwnership: CourseOwnershipService,
  ) {}

  private async assertCompetencyOwnership(competencyId: string, user: JwtPayload): Promise<void> {
    const courseId = await this.repo.getCourseId(competencyId);
    if (!courseId) throw new NotFoundException('Competencia no encontrada');
    await this.courseOwnership.assertOwnership(courseId, user);
  }

  // ---------- Lecturas ----------

  @Query(() => [CompetencyType])
  async courseCompetencies(@Args('courseId') courseId: string): Promise<CompetencyType[]> {
    const rows = await this.repo.listByCourse(courseId);
    return rows as unknown as CompetencyType[];
  }

  @Query(() => [CompetencyType])
  async lessonCompetencies(@Args('lessonId') lessonId: string): Promise<CompetencyType[]> {
    const rows = await this.repo.listByLesson(lessonId);
    return rows as unknown as CompetencyType[];
  }

  // ---------- Gestión (docente) ----------

  @Mutation(() => CompetencyType)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async createCompetency(
    @Args('input') input: CreateCompetencyInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompetencyType> {
    await this.courseOwnership.assertOwnership(input.courseId, user);
    const row = await this.repo.create(input);
    return row as unknown as CompetencyType;
  }

  @Mutation(() => CompetencyType)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async updateCompetency(
    @Args('input') input: UpdateCompetencyInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompetencyType> {
    await this.assertCompetencyOwnership(input.id, user);
    const { id, ...rest } = input;
    const row = await this.repo.update(id, rest);
    if (!row) throw new NotFoundException('Competencia no encontrada');
    return row as unknown as CompetencyType;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async deleteCompetency(
    @Args('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertCompetencyOwnership(id, user);
    await this.repo.remove(id);
    return true;
  }

  // ---------- Vínculos N:M ----------

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async linkLessonCompetency(
    @Args('lessonId') lessonId: string,
    @Args('competencyId') competencyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertCompetencyOwnership(competencyId, user);
    await this.repo.linkLesson(lessonId, competencyId);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async unlinkLessonCompetency(
    @Args('lessonId') lessonId: string,
    @Args('competencyId') competencyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertCompetencyOwnership(competencyId, user);
    await this.repo.unlinkLesson(lessonId, competencyId);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async linkQuestionCompetency(
    @Args('questionId') questionId: string,
    @Args('competencyId') competencyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertCompetencyOwnership(competencyId, user);
    await this.repo.linkQuestion(questionId, competencyId);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COMPETENCY_MANAGE)
  async unlinkQuestionCompetency(
    @Args('questionId') questionId: string,
    @Args('competencyId') competencyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertCompetencyOwnership(competencyId, user);
    await this.repo.unlinkQuestion(questionId, competencyId);
    return true;
  }
}
