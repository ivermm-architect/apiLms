import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Matriculación institucional por año: el administrador (oficina) inscribe a un
 * estudiante en TODAS las materias publicadas de un año académico (1–2), de forma
 * idempotente. La inscripción no es autoservicio del estudiante.
 */
@InputType()
export class AdminEnrollYearInput {
  @Field() @IsUUID() userId!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(2) academicYear!: number;
}

@InputType()
export class TrackLessonViewInput {
  @Field() @IsUUID() enrollmentId!: string;
  @Field() @IsUUID() lessonId!: string;
  @Field() @IsBoolean() isCompleted!: boolean;
}
