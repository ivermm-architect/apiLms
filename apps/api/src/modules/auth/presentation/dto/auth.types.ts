import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AuthUserType {
  @Field() id!: string;
  @Field() email!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) phone?: string | null;
  @Field(() => String, { nullable: true }) birthday?: string | null;
  @Field(() => String, { nullable: true }) profession?: string | null;
  @Field(() => String, { nullable: true }) bio?: string | null;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  /** Ficha académica (solo alumnos): matrícula. La fija secretaría, no editable. */
  @Field(() => String, { nullable: true }) studentCode?: string | null;
  /** Ficha académica: documento de identidad (CI). */
  @Field(() => String, { nullable: true }) documentId?: string | null;
  /** Año académico actual del alumno (1 | 2). Null para staff. */
  @Field(() => Int, { nullable: true }) cohortYear?: number | null;
  /** Nombre de la malla curricular del alumno. Derivado de sus matrículas. */
  @Field(() => String, { nullable: true }) curriculumName?: string | null;
  /** Estado de la cuenta: active | inactive | suspended | pending. */
  @Field() status!: string;
  /** True si el correo ya fue verificado. */
  @Field() emailVerified!: boolean;
  /** True si la cuenta debe cambiar la contraseña temporal en este login. */
  @Field() mustChangePassword!: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastLoginAt?: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => [String]) roles!: string[];
}

/** Una sesión = un refresh token activo (un dispositivo/navegador). */
@ObjectType()
export class SessionType {
  @Field() id!: string;
  @Field(() => String, { nullable: true }) userAgent?: string | null;
  @Field(() => String, { nullable: true }) ipAddress?: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) expiresAt!: Date;
  /** True para la sesión desde la que se hace la consulta (match por sessionId del JWT). */
  @Field() current!: boolean;
}

@ObjectType()
export class AuthPayloadType {
  @Field() accessToken!: string;
  @Field() refreshToken!: string;
  @Field() expiresIn!: number;
  @Field(() => AuthUserType) user!: AuthUserType;
}

@ObjectType()
export class TokenPairType {
  @Field() accessToken!: string;
  @Field() refreshToken!: string;
  @Field() expiresIn!: number;
}
