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

/** Competencia con menor dominio medio del plantel del docente. */
@ObjectType()
export class WeakestCompetencyType {
  @Field() code!: string;
  @Field() name!: string;
  /** Dominio medio 0..1 (avg de competency_progress.mastery). */
  @Field(() => Float) avgMastery!: number;
  /** Curso donde esta competencia es más débil (para drill-down). */
  @Field() courseId!: string;
}

/** Una competencia en riesgo de un estudiante (fila del roster docente). */
@ObjectType()
export class InstructorAtRiskCompetencyType {
  @Field() code!: string;
  @Field() name!: string;
  /** Dominio 0..1 (competency_progress.mastery). */
  @Field(() => Float) mastery!: number;
}

/** Estudiante con ≥1 competencia en riesgo en un curso del docente. */
@ObjectType()
export class InstructorAtRiskStudentType {
  @Field() userId!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() email!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field() courseId!: string;
  @Field() courseTitle!: string;
  /** Dominio más bajo entre sus competencias en riesgo (para ordenar). */
  @Field(() => Float) lowestMastery!: number;
  /** Última actividad del estudiante en el curso (enrollment.updatedAt). */
  @Field(() => GraphQLISODateTime, { nullable: true }) lastActivityAt?: Date | null;
  @Field(() => [InstructorAtRiskCompetencyType])
  competencies!: InstructorAtRiskCompetencyType[];
}

/** Tramo del histograma de dominio (mastery) de los cursos del docente. */
@ObjectType()
export class InstructorMasteryBucketType {
  @Field() rangeLabel!: string;
  @Field(() => Int) count!: number;
}

/** Conteo de competency_progress por estado en los cursos del docente. */
@ObjectType()
export class InstructorCompetencyStatusType {
  @Field() status!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class InstructorDashboardStatsType {
  @Field(() => Int) publishedCourses!: number;
  @Field(() => Int) draftCourses!: number;
  @Field(() => Int) totalStudents!: number;
  /** Intentos entregados sin calificar en todos los cursos del docente. */
  @Field(() => Int) pendingGradesCount!: number;
  /** Estudiantes distintos con ≥1 competencia en riesgo (detección temprana). */
  @Field(() => Int) studentsAtRisk!: number;
  /** Estudiantes activos sin actividad ≥7 días y curso sin completar. */
  @Field(() => Int) inactiveStudents!: number;
  /** Competencia más débil del plantel; null si aún no hay progreso registrado. */
  @Field(() => WeakestCompetencyType, { nullable: true })
  weakestCompetency?: WeakestCompetencyType | null;
  /** Distribución de dominio (mastery) de sus alumnos en 4 tramos. */
  @Field(() => [InstructorMasteryBucketType])
  masteryHistogram!: InstructorMasteryBucketType[];
  /** Reparto por estado de competencia de sus alumnos. */
  @Field(() => [InstructorCompetencyStatusType])
  competencyStatusDistribution!: InstructorCompetencyStatusType[];
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
