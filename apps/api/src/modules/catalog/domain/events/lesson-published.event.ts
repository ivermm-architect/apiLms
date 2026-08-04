import { BaseDomainEvent } from '../../../../shared/domain/domain-event.base';

/** Se emite cuando se añade una lección a un curso ya publicado. */
export class LessonPublishedEvent extends BaseDomainEvent {
  readonly eventName = 'catalog.lesson_published';

  constructor(
    public readonly lessonId: string,
    public readonly courseId: string,
    public readonly lessonTitle: string,
  ) {
    super(lessonId);
  }
}
