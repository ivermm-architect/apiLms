import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdaptiveOptionType {
  @Field() id!: string;
  @Field() text!: string;
}

@ObjectType()
export class AdaptiveItemType {
  @Field() id!: string;
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [AdaptiveOptionType], { nullable: true }) options?: AdaptiveOptionType[] | null;
}

/** Paso del examen adaptativo: estado tras iniciar o responder. */
@ObjectType()
export class AdaptiveStepType {
  @Field() attemptId!: string;
  /** Habilidad estimada θ (EAP). */
  @Field(() => Float) theta!: number;
  /** Error estándar de la estimación. */
  @Field(() => Float) se!: number;
  @Field(() => Int) itemsAdministered!: number;
  /** ¿Se alcanzó el criterio de parada? */
  @Field() finished!: boolean;
  /** Siguiente ítem a presentar (null si finalizó). */
  @Field(() => AdaptiveItemType, { nullable: true }) nextItem?: AdaptiveItemType | null;
}

/** Fila del informe adaptativo por competencia (estudiante). */
@ObjectType()
export class CompetencyReportRowType {
  @Field() competencyId!: string;
  @Field() code!: string;
  @Field() name!: string;
  /** Nivel de dominio 0..1. */
  @Field(() => Float) mastery!: number;
  @Field() status!: string;
  @Field(() => Float, { nullable: true }) theta?: number | null;
  @Field(() => Float, { nullable: true }) se?: number | null;
}

@ObjectType()
export class AdaptiveReportType {
  @Field() userId!: string;
  @Field() courseId!: string;
  /** θ global del estudiante. */
  @Field(() => Float, { nullable: true }) globalTheta?: number | null;
  @Field(() => Float, { nullable: true }) globalSe?: number | null;
  @Field(() => [CompetencyReportRowType]) competencies!: CompetencyReportRowType[];
  /** Dificultades (b) de los ítems calibrados del curso, para el mapa persona-ítem. */
  @Field(() => [Float]) itemDifficulties!: number[];
}
