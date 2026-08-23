import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Informe de aprendizaje redactado por IA (tesis §2.9). En lenguaje natural,
 * sin cifras psicométricas. Si `generated=false`, la UI oculta el informe
 * (IA deshabilitada, fallo o estudiante sin datos).
 */
@ObjectType()
export class LearningReportType {
  @Field(() => Boolean) generated!: boolean;
  @Field(() => String, { nullable: true }) summary?: string | null;
  @Field(() => [String]) strengths!: string[];
  @Field(() => [String]) weaknesses!: string[];
  @Field(() => [String]) recommendations!: string[];
}
