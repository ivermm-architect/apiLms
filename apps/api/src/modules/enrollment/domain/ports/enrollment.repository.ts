import { Enrollment, LessonProgress } from '@cieba/db';

export const ENROLLMENT_REPOSITORY = Symbol('ENROLLMENT_REPOSITORY');

export interface EnrollmentRepository {
  findById(id: string): Promise<Enrollment | null>;
  findByUserAndCourse(userId: string, courseId: string): Promise<Enrollment | null>;
  listByUser(userId: string): Promise<Enrollment[]>;
  create(input: { userId: string; courseId: string; expiresAt?: Date }): Promise<Enrollment>;
  updateProgress(
    id: string,
    input: { lessonsCompleted: number; progressPercentage: number; lastLessonId?: string },
  ): Promise<Enrollment>;
  complete(id: string): Promise<Enrollment>;
  delete(id: string): Promise<void>;
}

export const LESSON_PROGRESS_REPOSITORY = Symbol('LESSON_PROGRESS_REPOSITORY');

export interface LessonProgressRepository {
  findByUserAndLesson(userId: string, lessonId: string): Promise<LessonProgress | null>;
  listByEnrollment(enrollmentId: string): Promise<LessonProgress[]>;
  upsert(input: {
    enrollmentId: string;
    userId: string;
    lessonId: string;
    isCompleted: boolean;
  }): Promise<LessonProgress>;
  countCompletedByEnrollment(enrollmentId: string): Promise<number>;
}
