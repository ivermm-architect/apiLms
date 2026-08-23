import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class EnrollmentType {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() courseId!: string;
  @Field(() => GraphQLISODateTime) enrolledAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) startedAt?: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) completedAt?: Date | null;
  @Field() progressPercentage!: string;
  @Field(() => Int) lessonsCompleted!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => String, { nullable: true }) lastLessonId?: string | null;
  @Field() status!: string;
}

@ObjectType()
export class TrackLessonViewResultType {
  @Field() progressPercentage!: number;
  @Field(() => Int) lessonsCompleted!: number;
  @Field(() => Int) totalLessons!: number;
  @Field() courseCompleted!: boolean;
}

@ObjectType()
export class EnrollYearResultType {
  /** Materias en las que se inscribió al estudiante en esta operación. */
  @Field(() => Int) enrolled!: number;
  /** Materias que el estudiante ya tenía (saltadas). */
  @Field(() => Int) skipped!: number;
  /** Total de materias publicadas del año. */
  @Field(() => Int) total!: number;
  /** Año académico procesado (1–2). */
  @Field(() => Int) academicYear!: number;
}

@ObjectType()
export class UserEnrollmentType {
  @Field() enrollmentId!: string;
  @Field() courseId!: string;
  @Field() courseTitle!: string;
  @Field(() => Int) academicYear!: number;
  @Field() status!: string;
  @Field() progressPercentage!: string;
  @Field(() => Int) lessonsCompleted!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => GraphQLISODateTime) enrolledAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) completedAt?: Date | null;
}

@ObjectType()
export class CourseStudentType {
  @Field() enrollmentId!: string;
  @Field() userId!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() email!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field() status!: string;
  @Field() progressPercentage!: string;
  @Field(() => Int) lessonsCompleted!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => GraphQLISODateTime) enrolledAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) completedAt?: Date | null;
  /** Promedio de calificaciones 0–100 del estudiante en el curso; null si no tiene notas. */
  @Field(() => Float, { nullable: true }) avgGrade?: number | null;
}
