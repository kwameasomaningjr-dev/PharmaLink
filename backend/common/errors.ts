export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, any>;

  constructor(code: string, message: string, statusCode = 400, details: Record<string, any> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, any> = {}) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found.`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(code = 'STATE_CONFLICT', message = 'The requested operation conflicts with current system state.', details: Record<string, any> = {}) {
    super(code, message, 409, details);
  }
}

export class OrderNotAcceptableError extends AppError {
  constructor(message = 'This order can no longer be accepted due to insufficient available stock.') {
    super('ORDER_NOT_ACCEPTABLE', message, 409);
  }
}
