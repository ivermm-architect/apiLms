import { Field, InputType, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CompetencyType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field() code!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
}

@InputType()
export class CreateCompetencyInput {
  @Field() courseId!: string;
  @Field() code!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
}

@InputType()
export class UpdateCompetencyInput {
  @Field() id!: string;
  @Field(() => String, { nullable: true }) code?: string;
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) description?: string | null;
}
