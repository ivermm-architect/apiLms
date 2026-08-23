import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class CourseType {
  @Field() id!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) subtitle?: string | null;
  @Field() description!: string;
  @Field(() => String, { nullable: true }) requirements?: string | null;
  @Field(() => String, { nullable: true }) targetAudience?: string | null;
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null;
  @Field() instructorId!: string;
  @Field(() => String, { nullable: true }) curriculumId?: string | null;
  @Field() level!: string;
  @Field(() => Int) academicYear!: number;
  @Field() language!: string;
  @Field() status!: string;
  @Field(() => Int) durationMinutes!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => Int) totalStudents!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

/** Malla curricular = plan de estudios versionado (Res. Ministerial). */
@ObjectType()
export class MallaType {
  @Field() id!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) resolution?: string | null;
  @Field() status!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  /** Nº de cursos (no eliminados) colgados de esta malla. */
  @Field(() => Int) courseCount!: number;
}

/** Bloque de horario semanal de un curso. dayOfWeek 1=lunes … 7=domingo. */
@ObjectType()
export class CourseScheduleType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field(() => Int) dayOfWeek!: number;
  /** 'HH:MM' 24h. */
  @Field() startTime!: string;
  /** 'HH:MM' 24h. */
  @Field() endTime!: string;
  @Field(() => String, { nullable: true }) room?: string | null;
  /** Título del curso; presente en `mySchedule` (vista docente/estudiante). */
  @Field(() => String, { nullable: true }) courseTitle?: string | null;
  /** Nombre del docente; presente en `allSchedules` (vista admin global). */
  @Field(() => String, { nullable: true }) instructorName?: string | null;
}

@ObjectType()
export class SectionType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => Int) position!: number;
  @Field() isActive!: boolean;
}

@ObjectType()
export class LessonType {
  @Field() id!: string;
  @Field() sectionId!: string;
  @Field() courseId!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) content?: string | null;
  @Field(() => Int) position!: number;
  @Field() isFreePreview!: boolean;
  @Field() isActive!: boolean;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class CourseListMeta {
  @Field(() => Int) total!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageSize!: number;
  @Field(() => Int) totalPages!: number;
}

@ObjectType()
export class CourseListType {
  @Field(() => [CourseType]) items!: CourseType[];
  @Field(() => CourseListMeta) meta!: CourseListMeta;
}

@ObjectType()
export class TopInstructorType {
  @Field() id!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) profession?: string | null;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => Int) courseCount!: number;
  @Field(() => Int) totalStudents!: number;
}

@ObjectType()
export class InstructorCourseType {
  @Field() id!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) subtitle?: string | null;
  @Field() description!: string;
  @Field(() => String, { nullable: true }) requirements?: string | null;
  @Field(() => String, { nullable: true }) targetAudience?: string | null;
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null;
  @Field() level!: string;
  @Field(() => Int) academicYear!: number;
  @Field() status!: string;
  @Field(() => Int) durationMinutes!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => Int) totalStudents!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  /** Promedio de progreso de estudiantes inscritos (0–100). */
  @Field() avgProgress!: string;
  /** Última actividad de cualquier estudiante en este curso. */
  @Field(() => GraphQLISODateTime, { nullable: true }) lastActivityAt?: Date | null;
  /** Intentos de evaluación entregados que esperan calificación manual. */
  @Field(() => Int) pendingGradesCount!: number;
}

/**
 * Estudiante en riesgo en un curso del docente, detectado por REGLAS simples
 * (sin psicometría). Una fila por (estudiante × curso). Motivos posibles:
 *  - 'inactivity'      → inscripción activa, curso sin completar, ≥7 días sin actividad.
 *  - 'low_grades'      → promedio de calificaciones < 51 (umbral de aprobación BO).
 *  - 'pending_grading' → tiene entregas sin calificar.
 */
@ObjectType()
export class InstructorAtRiskStudentType {
  @Field() userId!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() email!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field() courseId!: string;
  @Field() courseTitle!: string;
  /** Última actividad del estudiante en el curso (enrollment.updatedAt). */
  @Field(() => GraphQLISODateTime, { nullable: true }) lastActivityAt?: Date | null;
  /** Promedio de calificaciones 0–100; null si aún no tiene notas. */
  @Field(() => Float, { nullable: true }) avgGrade?: number | null;
  /** Entregas del estudiante en el curso a la espera de calificación. */
  @Field(() => Int) pendingCount!: number;
  /** Cumple la regla de inactividad (≥7 días sin actividad). */
  @Field() inactive!: boolean;
  /** Motivos por los que aparece en riesgo (para ordenar y explicar). */
  @Field(() => [String]) reasons!: string[];
}

@ObjectType()
export class InstructorDashboardStatsType {
  @Field(() => Int) publishedCourses!: number;
  @Field(() => Int) draftCourses!: number;
  @Field(() => Int) totalStudents!: number;
  /** Intentos entregados sin calificar en todos los cursos del docente. */
  @Field(() => Int) pendingGradesCount!: number;
  /** Estudiantes distintos en riesgo por reglas (notas bajas / pendientes / inactividad). */
  @Field(() => Int) studentsAtRisk!: number;
  /** Estudiantes activos sin actividad ≥7 días y curso sin completar. */
  @Field(() => Int) inactiveStudents!: number;
}

@ObjectType()
export class MonthlyEnrollmentPointType {
  /** YYYY-MM, ordenado ascendente */
  @Field() month!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class InstructorTopCourseType {
  @Field() id!: string;
  @Field() title!: string;
  @Field(() => Int) totalStudents!: number;
}

@ObjectType()
export class InstructorAnalyticsType {
  @Field(() => [MonthlyEnrollmentPointType]) enrollmentsByMonth!: MonthlyEnrollmentPointType[];
  @Field(() => [InstructorTopCourseType]) topCoursesByStudents!: InstructorTopCourseType[];
  /** 0–100 */
  @Field() completionRate!: string;
  @Field(() => Int) totalEnrollments!: number;
  @Field(() => Int) completedEnrollments!: number;
}
