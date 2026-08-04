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
export class CreateEvaluationInput {
  @Field() @IsUUID() courseId!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUUID() lessonId?: string;
  @Field() @IsString() @MinLength(2) title!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() description?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard', 'adaptive'])
  difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive';
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
