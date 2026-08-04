import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';

import {
  EntityNotFoundException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { CourseCompletedEvent } from '../../domain/events/student-enrolled.event';
import {
  ENROLLMENT_REPOSITORY,
  LESSON_PROGRESS_REPOSITORY,
  EnrollmentRepository,
  LessonProgressRepository,
} from '../../domain/ports/enrollment.repository';

export class TrackLessonViewCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly enrollmentId: string,
    public readonly lessonId: string,
    public readonly isCompleted: boolean,
  ) {}
}

export interface TrackLessonViewResult {
  progressPercentage: number;
  lessonsCompleted: number;
  totalLessons: number;
  courseCompleted: boolean;
}

@CommandHandler(TrackLessonViewCommand)
export class TrackLessonViewHandler implements ICommandHandler<
  TrackLessonViewCommand,
  TrackLessonViewResult
> {
  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly enrollments: EnrollmentRepository,
    @Inject(LESSON_PROGRESS_REPOSITORY)
    private readonly progress: LessonProgressRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: TrackLessonViewCommand): Promise<TrackLessonViewResult> {
    const enrollment = await this.enrollments.findById(cmd.enrollmentId);
    if (!enrollment) throw new EntityNotFoundException('Enrollment', cmd.enrollmentId);
    if (enrollment.userId !== cmd.userId) {
      throw new ForbiddenDomainException('Esta inscripción no te pertenece');
    }

    // 1. Upsert progreso de la lección
    await this.progress.upsert({
      enrollmentId: cmd.enrollmentId,
      userId: cmd.userId,
      lessonId: cmd.lessonId,
      isCompleted: cmd.isCompleted,
    });

    // 2. Recalcular agregados
    const lessonsCompleted = await this.progress.countCompletedByEnrollment(cmd.enrollmentId);
    const totalLessons = enrollment.totalLessons || 1;
    const progressPercentage = Math.min(100, (lessonsCompleted / totalLessons) * 100);

    await this.enrollments.updateProgress(cmd.enrollmentId, {
      lessonsCompleted,
      progressPercentage,
      lastLessonId: cmd.lessonId,
    });

    // 3. Si completó 100%, marcar enrollment y emitir evento
    const courseCompleted = progressPercentage >= 100 && enrollment.status !== 'completed';
    if (courseCompleted) {
      await this.enrollments.complete(cmd.enrollmentId);
      this.eventBus.publish(
        new CourseCompletedEvent(cmd.enrollmentId, cmd.userId, enrollment.courseId),
      );
    }

    return {
      progressPercentage,
      lessonsCompleted,
      totalLessons,
      courseCompleted,
    };
  }
}
