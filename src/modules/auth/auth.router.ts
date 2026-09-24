import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { sendSuccess } from '../../common/response.js';
import { authenticateJwt } from '../../common/middleware.js';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.register(req.body);
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.login(req.body);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticateJwt, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.getMe(req.user!.id);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
});
