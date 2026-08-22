import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: string;
  email: string;
}

// extend express user to avoid type conflicts with passport
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name?: string;
      avatar?: string | null;
    }
  }
}

// jwt-authenticated request carries userId on req.jwtUser
declare module 'express-serve-static-core' {
  interface Request {
    jwtUser?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.jwtUser = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}
