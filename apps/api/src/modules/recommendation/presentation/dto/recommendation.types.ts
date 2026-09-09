import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/** Curso recomendado a un estudiante, con su justificación. */
@ObjectType()
export class RecommendedCourseType {
  @Field() courseId!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) subtitle?: string | null;
  @Field(() => String, { nullable: true }) coverUrl?: string | null;
  @Field() level!: string;
  @Field(() => Int) totalStudents!: number;
  /** Relevancia determinista (suma de déficits de competencias reforzadas). */
  @Field(() => Float) relevance!: number;
  /** Competencias débiles del estudiante que este curso refuerza. */
  @Field(() => [String]) matchedCompetencies!: string[];
  /** Justificación (determinista, o reescrita por IA si está habilitada). */
  @Field() reason!: string;
  /**
   * true mientras la IA está reescribiendo las justificaciones en segundo plano
   * y aún no hay texto pulido. Permite a la UI mostrar el estado "generando…"
   * en lugar de fingir que el texto determinista es el definitivo.
   */
  @Field(() => Boolean) aiPending!: boolean;
}
