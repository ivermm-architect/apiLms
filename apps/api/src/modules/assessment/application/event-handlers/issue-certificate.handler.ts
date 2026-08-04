import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { CourseCompletedEvent } from '../../../enrollment/domain/events/student-enrolled.event';
import { DrizzleCertificateRepository } from '../../infrastructure/drizzle-certificate.repository';

/**
 * Al completar un curso, emite el certificado (verificable por código).
 */
@EventsHandler(CourseCompletedEvent)
export class IssueCertificateHandler implements IEventHandler<CourseCompletedEvent> {
  private readonly logger = new Logger(IssueCertificateHandler.name);

  constructor(private readonly certs: DrizzleCertificateRepository) {}

  async handle(event: CourseCompletedEvent): Promise<void> {
    const existing = await this.certs.findByStudentAndCourse(event.userId, event.courseId);
    if (existing) {
      this.logger.warn(`Certificate already exists for ${event.userId}/${event.courseId}`);
      return;
    }

    const cert = await this.certs.issue({
      studentId: event.userId,
      courseId: event.courseId,
      enrollmentId: event.enrollmentId,
    });

    this.logger.log(`🎓 Certificate issued: ${cert.certificateCode}`);
  }
}
