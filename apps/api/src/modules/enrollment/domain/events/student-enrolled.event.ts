import { BaseDomainEvent } from '../../../../shared/domain/domain-event.base';

export class StudentEnrolledEvent extends BaseDomainEvent {
  readonly eventName = 'enrollment.student_enrolled';

  constructor(
    public readonly enrollmentId: string,
    public readonly userId: string,
    public readonly courseId: string,
  ) {
    super(enrollmentId);
  }
}

export class CourseCompletedEvent extends BaseDomainEvent {
  readonly eventName = 'enrollment.course_completed';

  constructor(
    public readonly enrollmentId: string,
    public readonly userId: string,
    public readonly courseId: string,
  ) {
    super(enrollmentId);
  }
}
