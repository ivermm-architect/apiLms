import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class UserType {
  @Field() id!: string;
  @Field() email!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) phone?: string | null;
  @Field(() => String, { nullable: true }) profession?: string | null;
  @Field(() => String, { nullable: true }) documentId?: string | null;
  @Field(() => String, { nullable: true }) studentCode?: string | null;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field() status!: string;
  @Field() mustChangePassword!: boolean;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
  @Field(() => [String], { nullable: true }) roles?: string[];
}

/**
 * Respuesta de un alta: incluye la contraseña temporal en claro. Esta es la
 * ÚNICA vez que la contraseña se expone; nunca se persiste ni se re-consulta.
 * El frontend la usa para imprimir el comprobante de matrícula.
 */
@ObjectType()
export class CreatedUserType {
  @Field(() => UserType) user!: UserType;
  @Field() tempPassword!: string;
}

/** Resultado por fila de la carga masiva (para imprimir comprobantes por cohorte). */
@ObjectType()
export class BulkResultRow {
  @Field() email!: string;
  @Field(() => String, { nullable: true }) studentCode?: string | null;
  @Field(() => String, { nullable: true }) firstName?: string | null;
  @Field(() => String, { nullable: true }) lastName?: string | null;
  /** Contraseña temporal en claro (solo presente cuando status = 'created'). */
  @Field(() => String, { nullable: true }) tempPassword?: string | null;
  /** 'created' | 'error'. */
  @Field() status!: string;
  @Field(() => String, { nullable: true }) error?: string | null;
}

@ObjectType()
export class UserListMeta {
  @Field(() => Int) total!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageSize!: number;
  @Field(() => Int) totalPages!: number;
}

@ObjectType()
export class UserListType {
  @Field(() => [UserType]) items!: UserType[];
  @Field(() => UserListMeta) meta!: UserListMeta;
}
