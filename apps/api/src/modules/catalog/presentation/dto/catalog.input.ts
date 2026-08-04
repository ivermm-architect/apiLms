import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 'HH:MM' en formato 24h (00:00–23:59). */
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

@InputType()
export class CreateCourseInput {
  @Field() @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  subtitle?: string;
  @Field() @IsString() @MinLength(20) description!: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: 'beginner' | 'intermediate' | 'advanced';
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  academicYear?: number;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
  /** Malla curricular a la que se cuelga el curso (opcional). */
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() curriculumId?: string;
  /** Docente asignado (solo admin; si no viene, el creador). */
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() instructorId?: string;
}

@InputType()
export class UpdateCourseInput {
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MinLength(3) title?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() subtitle?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() requirements?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() targetAudience?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() coverImageUrl?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: 'beginner' | 'intermediate' | 'advanced';
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  academicYear?: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() language?: string;
}

@InputType()
export class ListCoursesInput {
  @Field(() => Int, { nullable: true, defaultValue: 1 }) @IsOptional() @IsInt() @Min(1) page = 1;
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() search?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() instructorId?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: 'beginner' | 'intermediate' | 'advanced';
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  academicYear?: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() sortBy?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsEnum(['asc', 'desc']) sortOrder?:
    'asc' | 'desc';
}

@InputType()
export class CreateSectionInput {
  @Field() @IsUUID() courseId!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) position?: number;
}

@InputType()
export class CreateLessonInput {
  @Field() @IsUUID() sectionId!: string;
  @Field() @IsUUID() courseId!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() content?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) position?: number;
}

@InputType()
export class UpdateSectionInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) position?: number;
}

@InputType()
export class UpdateLessonInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() content?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) position?: number;
  @Field(() => Boolean, { nullable: true }) @IsOptional() isFreePreview?: boolean;
}

@InputType()
export class CreateScheduleInput {
  @Field() @IsUUID() courseId!: string;
  /** 1=lunes … 7=domingo. */
  @Field(() => Int) @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @Field()
  @IsString()
  @Matches(TIME_HHMM, { message: 'startTime debe ser HH:MM (24h)' })
  startTime!: string;
  @Field()
  @IsString()
  @Matches(TIME_HHMM, { message: 'endTime debe ser HH:MM (24h)' })
  endTime!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) room?: string;
}

@InputType()
export class UpdateScheduleInput {
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(7) dayOfWeek?: number;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(TIME_HHMM, { message: 'startTime debe ser HH:MM (24h)' })
  startTime?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(TIME_HHMM, { message: 'endTime debe ser HH:MM (24h)' })
  endTime?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) room?: string;
}

@InputType()
export class ReorderItemInput {
  @Field() @IsUUID() id!: string;
  @Field(() => Int) @IsInt() @Min(0) position!: number;
}
