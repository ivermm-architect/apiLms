export class DomainException extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code = 'DOMAIN_ERROR',
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(entity: string, id?: string) {
    super(
      id ? `${entity} with id "${id}" not found` : `${entity} not found`,
      'ENTITY_NOT_FOUND',
      404,
    );
  }
}

export class UnauthorizedDomainException extends DomainException {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictDomainException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class EnrollmentAlreadyExistsException extends DomainException {
  constructor(userId: string, courseId: string) {
    super('Ya estás inscrito en este curso', 'ENROLLMENT_ALREADY_EXISTS', 409, {
      userId,
      courseId,
    });
  }
}

export class ReviewNotAllowedException extends DomainException {
  constructor(message: string) {
    super(message, 'REVIEW_NOT_ALLOWED', 403);
  }
}

export class InvalidTokenException extends DomainException {
  constructor(message = 'Token inválido o expirado') {
    super(message, 'INVALID_TOKEN', 400);
  }
}
