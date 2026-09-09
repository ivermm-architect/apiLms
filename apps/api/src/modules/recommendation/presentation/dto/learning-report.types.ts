import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Informe de aprendizaje redactado por IA (tesis §2.9). En lenguaje natural,
 * sin cifras psicométricas. Si `generated=false`, la UI oculta el informe
 * (IA deshabilitada, fallo o estudiante sin datos).
 */
@ObjectType()
export class LearningReportType {
  @Field(() => Boolean) generated!: boolean;
  /** true si la IA está redactando el informe en segundo plano (aún sin datos). */
  @Field(() => Boolean) pending!: boolean;
  @Field(() => String, { nullable: true }) summary?: string | null;
  @Field(() => [String]) strengths!: string[];
  @Field(() => [String]) weaknesses!: string[];
  @Field(() => [String]) recommendations!: string[];
  /** ISO-8601 en que la IA redactó el informe; null si aún no hay. */
  @Field(() => String, { nullable: true }) generatedAt?: string | null;
}
