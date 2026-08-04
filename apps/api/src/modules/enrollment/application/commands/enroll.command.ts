import { Enrollment } from '@cieba/db';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { EnrollmentAlreadyExistsException } from '../../../../shared/exceptions/domain.exception';
import { StudentEnrolledEvent } from '../../domain/events/student-enrolled.event';
import {
  ENROLLMENT_REPOSITORY,
  EnrollmentRepository,
} from '../../domain/ports/enrollment.repository';

export class EnrollCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
  ) {}
}

@CommandHandler(EnrollCommand)
export class EnrollHandler implements ICommandHandler<EnrollCommand, Enrollment> {
  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: EnrollmentRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: EnrollCommand): Promise<Enrollment> {
    const existing = await this.repo.findByUserAndCourse(cmd.userId, cmd.courseId);
    if (existing) {
      throw new EnrollmentAlreadyExistsException(cmd.userId, cmd.courseId);
    }

    const enrollment = await this.repo.create({
      userId: cmd.userId,
      courseId: cmd.courseId,
    });

    this.eventBus.publish(new StudentEnrolledEvent(enrollment.id, cmd.userId, cmd.courseId));

    return enrollment;
  }
}
