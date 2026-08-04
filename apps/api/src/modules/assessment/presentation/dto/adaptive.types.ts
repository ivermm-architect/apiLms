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

/** Dominio agregado por competencia en un curso (docente). */
@ObjectType()
export class CourseCompetencyMasteryType {
  @Field() competencyId!: string;
  @Field() code!: string;
  @Field() name!: string;
  @Field(() => Float) avgMastery!: number;
  @Field(() => Int) studentsTracked!: number;
  @Field(() => Int) studentsAtRisk!: number;
  @Field(() => Int) studentsMastered!: number;
}

@ObjectType()
export class CalibrationResultType {
  @Field() questionId!: string;
  @Field(() => Float) a!: number;
  @Field(() => Float) b!: number;
  @Field(() => Int) sampleSize!: number;
  @Field() calibrated!: boolean;
  /** Origen de los parámetros: 'empirical' | 'ai_prior' | null (no calibrado). */
  @Field(() => String, { nullable: true }) source?: string | null;
}

/** Salud del banco de ítems de una competencia (docente). */
@ObjectType()
export class CompetencyItemHealthType {
  @Field() competencyId!: string;
  @Field() code!: string;
  @Field() name!: string;
  /** Ítems del curso asociados a esta competencia. */
  @Field(() => Int) totalItems!: number;
  /** Ítems con parámetros TRI calibrados. */
  @Field(() => Int) calibratedItems!: number;
  /** Ítems sin calibrar o con muestra insuficiente (< 10 respuestas). */
  @Field(() => Int) itemsNeedingResponses!: number;
  @Field(() => Int) easyItems!: number;
  @Field(() => Int) mediumItems!: number;
  @Field(() => Int) hardItems!: number;
  /** Dificultad TRI media (b) de los ítems calibrados; null si ninguno. */
  @Field(() => Float, { nullable: true }) avgDifficultyB?: number | null;
}

/** Salud agregada del banco de ítems de un curso (docente). */
@ObjectType()
export class CourseItemBankHealthType {
  @Field() courseId!: string;
  /** Total de ítems de las evaluaciones del curso. */
  @Field(() => Int) totalItems!: number;
  /** Ítems calibrados en todo el curso. */
  @Field(() => Int) calibratedItems!: number;
  /** Proporción calibrada 0..1 (0 si no hay ítems). */
  @Field(() => Float) calibrationRate!: number;
  @Field(() => [CompetencyItemHealthType]) competencies!: CompetencyItemHealthType[];
}
