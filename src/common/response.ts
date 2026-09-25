import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Record<string, any>) {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details: Record<string, any> = {},
  requestId?: string
) {
  return res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      request_id: requestId || (res.locals?.requestId as string) || 'req_' + Date.now(),
    },
  });
}
