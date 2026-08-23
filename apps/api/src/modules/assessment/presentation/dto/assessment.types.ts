import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class GradeType {
  @Field() id!: string;
  @Field() studentId!: string;
  @Field() teacherId!: string;
  @Field() courseId!: string;
  @Field() enrollmentId!: string;
  @Field(() => String, { nullable: true }) lessonId?: string | null;
  @Field() title!: string;
  @Field() score!: string;
  @Field() maxScore!: string;
  @Field() weight!: string;
  @Field(() => String, { nullable: true }) feedback?: string | null;
  @Field(() => GraphQLISODateTime) gradedAt!: Date;
}

@ObjectType()
export class EvaluationType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field(() => String, { nullable: true }) lessonId?: string | null;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field() difficulty!: string;
  @Field(() => Int, { nullable: true }) timeLimitMinutes?: number | null;
  @Field() passingScore!: string;
  @Field(() => Int) maxAttempts!: number;
  @Field() isAiGenerated!: boolean;
}

@ObjectType()
export class EvaluationQuestionOption {
  @Field() id!: string;
  @Field() text!: string;
}

@ObjectType()
export class EvaluationQuestionType {
  @Field() id!: string;
  @Field() evaluationId!: string;
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [EvaluationQuestionOption], { nullable: true })
  options?: EvaluationQuestionOption[];
  @Field() points!: string;
  @Field(() => Int) position!: number;
}

@ObjectType()
export class EvaluationAttemptType {
  @Field() id!: string;
  @Field() evaluationId!: string;
  @Field() studentId!: string;
  @Field(() => Int) attemptNumber!: number;
  @Field(() => String, { nullable: true }) score?: string | null;
  @Field(() => String, { nullable: true }) maxScore?: string | null;
  @Field(() => String, { nullable: true }) percentage?: string | null;
  @Field() isPassed!: boolean;
  @Field(() => GraphQLISODateTime) startedAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt?: Date | null;
}

@ObjectType()
export class PendingOpenAnswerType {
  @Field() answerId!: string;
  @Field() attemptId!: string;
  @Field() evaluationId!: string;
  @Field() evaluationTitle!: string;
  @Field() questionId!: string;
  @Field() questionText!: string;
  @Field() maxPoints!: string;
  @Field(() => String, { nullable: true }) answer?: string | null;
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field() enrollmentId!: string;
  @Field() courseId!: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt?: Date | null;
}

/** Opción propuesta por la IA para una pregunta (borrador, sin persistir). */
@ObjectType()
export class SuggestedOptionType {
  @Field() id!: string;
  @Field() text!: string;
  @Field() isCorrect!: boolean;
}

/**
 * Pregunta PROPUESTA por la IA para que el docente la revise/edite antes de
 * crearla. No se persiste ni se publica automáticamente.
 */
@ObjectType()
export class SuggestedQuestionType {
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [SuggestedOptionType]) options!: SuggestedOptionType[];
  @Field(() => String, { nullable: true }) correctAnswer?: string | null;
  @Field(() => String, { nullable: true }) explanation?: string | null;
  @Field() difficulty!: string;
  /** Justificación en lenguaje natural de la propuesta. */
  @Field() justification!: string;
}
