import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class LeveledOptionType {
  @Field() id!: string;
  @Field() text!: string;
}

@ObjectType()
export class LeveledQuestionType {
  @Field() id!: string;
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [LeveledOptionType], { nullable: true })
  options?: LeveledOptionType[] | null;
}

@ObjectType()
export class LeveledRecommendationType {
  /** 'refuerzo' | 'avance'. */
  @Field() type!: string;
  @Field() reason!: string;
  @Field(() => String, { nullable: true }) claseId?: string | null;
}

/** Paso del examen leveled: estado tras iniciar o responder. */
@ObjectType()
export class LeveledStepType {
  @Field() attemptId!: string;
  @Field() finished!: boolean;
  /** Porcentaje de aciertos al cerrar (null mientras está en curso). */
  @Field(() => Int, { nullable: true }) score?: number | null;
  @Field(() => Boolean, { nullable: true }) isPassed?: boolean | null;
  @Field(() => LeveledQuestionType, { nullable: true })
  nextQuestion?: LeveledQuestionType | null;
  @Field(() => LeveledRecommendationType, { nullable: true })
  recommendation?: LeveledRecommendationType | null;
}

/** Recomendación persistida (bandeja del estudiante). */
@ObjectType()
export class RecommendationAiType {
  @Field() id!: string;
  @Field() userId!: string;
  @Field() courseId!: string;
  @Field(() => String, { nullable: true }) claseId?: string | null;
  @Field() recommendationType!: string;
  @Field() reason!: string;
  @Field() sourceAi!: string;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}
