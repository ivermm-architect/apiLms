import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

@InputType()
export class GradeStudentInput {
  @Field() @IsUUID() studentId!: string;
  @Field() @IsUUID() courseId!: string;
  @Field() @IsUUID() enrollmentId!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() lessonId?: string;
  @Field() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @Field() @IsNumber() @Min(0) score!: number;
  @Field(() => Number, { nullable: true }) @IsOptional() @IsNumber() @Min(0) maxScore?: number;
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() feedback?: string;
}

@InputType()
export class CreateActivityInput {
  @Field() @IsUUID() courseId!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['practica', 'actividad'])
  category?: 'practica' | 'actividad';
  @Field(() => Number, { nullable: true }) @IsOptional() @IsNumber() @Min(1) maxScore?: number;
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;
}

@InputType()
export class SetCourseGradeWeightsInput {
  @Field() @IsUUID() courseId!: string;
  @Field(() => Number) @IsNumber() @Min(0) @Max(100) examWeight!: number;
  @Field(() => Number) @IsNumber() @Min(0) @Max(100) practiceWeight!: number;
  @Field(() => Number) @IsNumber() @Min(0) @Max(100) activityWeight!: number;
}

@InputType()
export class SetActivityGradeInput {
  @Field() @IsUUID() activityId!: string;
  @Field() @IsUUID() enrollmentId!: string;
  @Field() @IsNumber() @Min(0) score!: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() feedback?: string;
}

@InputType()
export class CreateEvaluationInput {
  @Field() @IsUUID() courseId!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() lessonId?: string;
  @Field() @IsString() @MinLength(2) title!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) timeLimitMinutes?: number;
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passingScore?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) maxAttempts?: number;
}

@InputType()
export class QuestionOptionInput {
  @Field() @IsString() id!: string;
  @Field() @IsString() text!: string;
  @Field() @IsBoolean() isCorrect!: boolean;
}

@InputType()
export class AddQuestionInput {
  @Field() @IsUUID() evaluationId!: string;
  @Field() @IsString() questionText!: string;
  @Field() @IsEnum(['multiple_choice', 'true_false', 'open', 'fill_blank']) questionType!: string;
  @Field(() => [QuestionOptionInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options?: QuestionOptionInput[];
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() correctAnswer?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() explanation?: string;
  @Field(() => Number, { nullable: true }) @IsOptional() @IsNumber() points?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() position?: number;
}

@InputType()
export class SuggestQuestionsInput {
  /** Curso (para verificar propiedad del docente). */
  @Field() @IsUUID() courseId!: string;
  /** Lección base del tema (opcional; se usa su título + contenido). */
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() lessonId?: string;
  /** Tema libre si no se indica una lección. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  topic?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['multiple_choice', 'true_false', 'open'])
  questionType?: 'multiple_choice' | 'true_false' | 'open';
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(10) count?: number;
}

@InputType()
export class AnswerInput {
  @Field() @IsUUID() questionId!: string;
  @Field() @IsString() answer!: string;
}

@InputType()
export class SubmitEvaluationInput {
  @Field() @IsUUID() attemptId!: string;
  @Field(() => [AnswerInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerInput)
  answers!: AnswerInput[];
}
