import { UniqueEntityID } from './unique-entity-id';

export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly eventName: string;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  abstract readonly eventName: string;

  constructor(aggregateId: string | UniqueEntityID) {
    this.eventId = new UniqueEntityID().value;
    this.occurredAt = new Date();
    this.aggregateId = typeof aggregateId === 'string' ? aggregateId : aggregateId.value;
  }
}
