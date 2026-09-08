import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType()
export class GradeType {
  @Field() id!: string;
  @Field() studentId!: string;
  @Field() teacherId!: string;
  @Field() courseId!: string;
  @Field() enrollmentId!: string;
  @Field(() => String, { nullable: true }) lessonId?: string | null;
  @Field() title!: string;
  @Field() score!: string;
  @Field() maxScore!: string;
  @Field() weight!: string;
  @Field(() => String, { nullable: true }) feedback?: string | null;
  @Field(() => GraphQLISODateTime) gradedAt!: Date;
}

/**
 * Actividad manual del curso (trabajo práctico, exposición, etc.). El docente la
 * crea una vez para toda la clase y luego califica a cada estudiante con un puntaje.
 * `gradedCount`/`totalStudents` alimentan el indicador "3/12 calificados".
 */
@ObjectType()
export class ActivityType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field(() => String, { nullable: true }) createdBy?: string | null;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field() category!: string;
  @Field() maxScore!: string;
  @Field() weight!: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) dueDate?: Date | null;
  @Field(() => Int) totalStudents!: number;
  @Field(() => Int) gradedCount!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

/** Pesos (%) de cada categoría para la nota final ponderada del curso. */
@ObjectType()
export class CourseGradeWeightsType {
  @Field() courseId!: string;
  @Field(() => Float) examWeight!: number;
  @Field(() => Float) practiceWeight!: number;
  @Field(() => Float) activityWeight!: number;
}

/**
 * Nota final ponderada de un estudiante en el curso, con el desglose por
 * categoría (promedios 0–100). `null` en una categoría = aún sin notas ahí.
 */
@ObjectType()
export class FinalGradeType {
  @Field() enrollmentId!: string;
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => Float, { nullable: true }) examAvg?: number | null;
  @Field(() => Float, { nullable: true }) practiceAvg?: number | null;
  @Field(() => Float, { nullable: true }) activityAvg?: number | null;
  @Field(() => Float, { nullable: true }) finalGrade?: number | null;
}

/**
 * Fila de la grilla de calificación de una actividad: un estudiante matriculado
 * con su nota si ya fue calificada (o `null` = "Pendiente").
 */
@ObjectType()
export class ActivityGradeRowType {
  @Field() enrollmentId!: string;
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => String, { nullable: true }) gradeId?: string | null;
  @Field(() => String, { nullable: true }) score?: string | null;
  @Field(() => String, { nullable: true }) maxScore?: string | null;
  @Field(() => String, { nullable: true }) feedback?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) gradedAt?: Date | null;
}

@ObjectType()
export class EvaluationType {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field(() => String, { nullable: true }) lessonId?: string | null;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field() difficulty!: string;
  @Field(() => Int, { nullable: true }) timeLimitMinutes?: number | null;
  @Field() passingScore!: string;
  @Field(() => Int) maxAttempts!: number;
  @Field() isAiGenerated!: boolean;
}

@ObjectType()
export class EvaluationQuestionOption {
  @Field() id!: string;
  @Field() text!: string;
  /** Solo se expone al docente (query "ForOwner"); null en la vista del estudiante. */
  @Field(() => Boolean, { nullable: true }) isCorrect?: boolean | null;
}

@ObjectType()
export class EvaluationQuestionType {
  @Field() id!: string;
  @Field() evaluationId!: string;
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [EvaluationQuestionOption], { nullable: true })
  options?: EvaluationQuestionOption[];
  @Field() points!: string;
  @Field(() => Int) position!: number;
  /** Solo para el docente; se oculta en la query del estudiante. */
  @Field(() => String, { nullable: true }) correctAnswer?: string | null;
  @Field(() => String, { nullable: true }) explanation?: string | null;
}

@ObjectType()
export class EvaluationAttemptType {
  @Field() id!: string;
  @Field() evaluationId!: string;
  @Field() studentId!: string;
  @Field(() => Int) attemptNumber!: number;
  @Field(() => String, { nullable: true }) score?: string | null;
  @Field(() => String, { nullable: true }) maxScore?: string | null;
  @Field(() => String, { nullable: true }) percentage?: string | null;
  @Field() isPassed!: boolean;
  @Field(() => GraphQLISODateTime) startedAt!: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt?: Date | null;
}

@ObjectType()
export class PendingOpenAnswerType {
  @Field() answerId!: string;
  @Field() attemptId!: string;
  @Field() evaluationId!: string;
  @Field() evaluationTitle!: string;
  @Field() questionId!: string;
  @Field() questionText!: string;
  @Field(() => String, { nullable: true }) expectedAnswer?: string | null;
  @Field() maxPoints!: string;
  @Field(() => String, { nullable: true }) answer?: string | null;
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field() enrollmentId!: string;
  @Field() courseId!: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt?: Date | null;
}

/**
 * Resultado agregado de una evaluación para el panel del docente: cuántos
 * estudiantes la rindieron, el promedio de sus mejores intentos y cuántos
 * la aprobaron. Sirve para la pestaña "Por evaluación" de calificaciones.
 */
@ObjectType()
export class EvaluationResultType {
  @Field() evaluationId!: string;
  @Field() title!: string;
  @Field() difficulty!: string;
  @Field() passingScore!: string;
  @Field(() => Int) questionCount!: number;
  @Field(() => Int) studentsSubmitted!: number;
  @Field(() => Float, { nullable: true }) averagePercentage?: number | null;
  @Field(() => Int) passedCount!: number;
}

/**
 * Resultado de un estudiante concreto en una evaluación (mejor intento). Se usa
 * en el detalle expandible de la pestaña "Por evaluación": quién la rindió, con
 * qué nota y si aprobó.
 */
@ObjectType()
export class EvaluationStudentResultType {
  @Field() studentId!: string;
  @Field() studentName!: string;
  @Field(() => Int) attempts!: number;
  @Field(() => String, { nullable: true }) score?: string | null;
  @Field(() => String, { nullable: true }) maxScore?: string | null;
  @Field(() => Float, { nullable: true }) percentage?: number | null;
  @Field() isPassed!: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt?: Date | null;
}

/** Opción propuesta por la IA para una pregunta (borrador, sin persistir). */
@ObjectType()
export class SuggestedOptionType {
  @Field() id!: string;
  @Field() text!: string;
  @Field() isCorrect!: boolean;
}

/**
 * Pregunta PROPUESTA por la IA para que el docente la revise/edite antes de
 * crearla. No se persiste ni se publica automáticamente.
 */
@ObjectType()
export class SuggestedQuestionType {
  @Field() questionText!: string;
  @Field() questionType!: string;
  @Field(() => [SuggestedOptionType]) options!: SuggestedOptionType[];
  @Field(() => String, { nullable: true }) correctAnswer?: string | null;
  @Field(() => String, { nullable: true }) explanation?: string | null;
  @Field() difficulty!: string;
  /** Justificación en lenguaje natural de la propuesta. */
  @Field() justification!: string;
}
