import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

@InputType()
export class RefreshInput {
  @Field()
  @IsString()
  refreshToken!: string;
}

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Fecha de nacimiento en formato ISO `YYYY-MM-DD`. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthday debe tener formato YYYY-MM-DD' })
  birthday?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  profession?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
