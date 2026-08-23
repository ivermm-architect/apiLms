import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class StudentReportType {
  @Field() studentId!: string;
  @Field(() => String, { nullable: true }) courseId?: string;
  @Field(() => Float) avgScore!: number;
  @Field(() => Float) progressPercentage!: number;
  @Field(() => Int) lessonsCompleted!: number;
  @Field(() => Int) totalLessons!: number;
  @Field() riskLevel!: string;
}

@ObjectType()
export class AlertType {
  @Field() id!: string;
  @Field() studentId!: string;
  @Field(() => String, { nullable: true }) courseId?: string | null;
  @Field() alertType!: string;
  @Field() severity!: string;
  @Field() message!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) acknowledgedAt?: Date | null;
}

@ObjectType()
export class AdminGestionPointType {
  /** Gestión calendario (año de matrícula, p.ej. 2024). */
  @Field(() => Int) gestion!: number;
  /** Alumnos distintos matriculados en esa gestión. */
  @Field(() => Int) count!: number;
}

@ObjectType()
export class AdminTopCourseType {
  @Field() id!: string;
  @Field() title!: string;
  @Field() instructorName!: string;
  @Field(() => Int) totalStudents!: number;
}

@ObjectType()
export class AdminRecentSignupType {
  @Field() id!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() email!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => [String]) roles!: string[];
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

/** Curso con riesgo sistémico: alto % de alumnos con progreso bajo (< 40%).
 *  Decisión admin (recursos/malla/docente), no intervención nominal (eso es del docente). */
@ObjectType()
export class AdminCourseRiskType {
  @Field() id!: string;
  @Field() title!: string;
  @Field() instructorName!: string;
  /** Alumnos distintos con progreso bajo (< 40% de lecciones) en el curso. */
  @Field(() => Int) atRiskStudents!: number;
  /** Alumnos distintos matriculados en el curso. */
  @Field(() => Int) trackedStudents!: number;
  /** Proporción en riesgo 0..1 (atRiskStudents / trackedStudents). */
  @Field(() => Float) riskRatio!: number;
}

@ObjectType()
export class AdminDashboardOverviewType {
  @Field(() => Int) activeUsers!: number;
  @Field(() => Int) publishedCourses!: number;
  @Field(() => Int) draftCourses!: number;
  @Field(() => Int) activeEnrollments!: number;

  /** Altas de usuario en la gestión (año calendario) en curso. Cadencia anual, no 30d. */
  @Field(() => Int) newUsersThisGestion!: number;

  /** Recursos institucionales: plantel, docentes y cobertura de asignación. */
  @Field(() => Int) totalStudents!: number;
  @Field(() => Int) totalTeachers!: number;
  /** Cursos activos (no borrados) sin docente asignado — requieren acción operativa. */
  @Field(() => Int) coursesWithoutInstructor!: number;

  @Field(() => [AdminGestionPointType]) enrollmentsByGestion!: AdminGestionPointType[];
  @Field(() => [AdminTopCourseType]) topCoursesByStudents!: AdminTopCourseType[];
  @Field(() => [AdminRecentSignupType]) recentSignups!: AdminRecentSignupType[];

  /** Cursos con mayor % de alumnos en riesgo (salud sistémica, decisión de recursos). */
  @Field(() => [AdminCourseRiskType]) coursesAtRisk!: AdminCourseRiskType[];
}

/** Indicadores agregados de una cohorte (año de ingreso del estudiante). */
@ObjectType()
export class CohortReportRowType {
  /** Año de ingreso (users.cohortYear). */
  @Field(() => Int) cohortYear!: number;
  /** Estudiantes distintos de la cohorte. */
  @Field(() => Int) studentCount!: number;
  /** Progreso medio de matrícula 0..100. */
  @Field(() => Float) avgProgress!: number;
  /** Nota media de la cohorte 0..100. */
  @Field(() => Float) avgScore!: number;
  /** Estudiantes distintos con progreso bajo (< 40% de lecciones). */
  @Field(() => Int) atRiskStudents!: number;
}
