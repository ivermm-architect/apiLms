import { BaseDomainEvent } from '../../../../shared/domain/domain-event.base';

export class UserLoggedInEvent extends BaseDomainEvent {
  readonly eventName = 'auth.user_logged_in';

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
  ) {
    super(userId);
  }
}
