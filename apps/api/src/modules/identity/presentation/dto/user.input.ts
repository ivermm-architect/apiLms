import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateUserInput {
  @Field() @IsEmail() email!: string;
  // La contraseña ya NO la teclea el admin: el sistema genera una temporal.
  @Field() @IsString() @MinLength(2) @MaxLength(100) firstName!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(100) lastName!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) profession?: string;
  /** CI / documento de identidad. UNIQUE. */
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(20) documentId?: string;
  /** Código de matrícula del instituto. Si se omite y el rol es estudiante, se deriva. */
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(20) studentCode?: string;
  /** Fecha de nacimiento en formato ISO (YYYY-MM-DD). */
  @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() birthday?: string;
  /** Cohorte para derivar el código de matrícula cuando no se provee. */
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(2000) @Max(2100) cohortYear?: number;
  @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @IsUUID('all', { each: true })
  roleIds?: string[];
}

/** Una fila de la cohorte en la carga masiva (el CSV lo parsea el frontend). */
@InputType()
export class BulkStudentRowInput {
  @Field() @IsString() @MinLength(2) @MaxLength(100) firstName!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(100) lastName!: string;
  @Field() @IsEmail() email!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(20) documentId?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(20) studentCode?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() birthday?: string;
}

@InputType()
export class BulkCreateStudentsInput {
  @Field(() => [BulkStudentRowInput]) @IsArray() rows!: BulkStudentRowInput[];
  /** Cohorte: deriva códigos de matrícula y (si enrollInYear) las materias a matricular. */
  @Field(() => Int) @IsInt() @Min(2000) @Max(2100) cohortYear!: number;
  /** Si true, matricula a cada alumno en las materias publicadas de la cohorte. */
  @Field(() => Boolean, { nullable: true }) @IsOptional() enrollInYear?: boolean;
}

@InputType()
export class UpdateUserInput {
  // El email NO se edita: el instituto no gestiona correos.
  @Field(() => String, { nullable: true })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) firstName?: string;
  @Field(() => String, { nullable: true })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) lastName?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) profession?: string;
}

@InputType()
export class ListUsersInput {
  @Field(() => Int, { nullable: true, defaultValue: 1 }) @IsOptional() @IsInt() @Min(1) page = 1;
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize = 20;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() search?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() sortBy?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsEnum(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
