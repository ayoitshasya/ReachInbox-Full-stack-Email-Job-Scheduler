// Express middleware and helpers for our own stateless JWT authentication
// layer, which sits on top of (but is independent from) Passport's Google
// OAuth flow. After a user logs in via Google (routes/auth.ts), we issue a
// JWT with signToken(); every subsequent protected API call is guarded by
// requireAuth(), which the route files (routes/auth.ts, routes/emails.ts) attach.
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// Shape of the data we encode into our own JWTs (not Google's tokens).
export interface JwtPayload {
  userId: string;
  email: string;
}

// extend express user to avoid type conflicts with passport
// Augments Passport's `Express.User` type so `req.user` (set by Passport
// during the OAuth callback) is typed with the fields our Google strategy
// actually populates, instead of being an empty/unknown shape.
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
// Adds an optional `jwtUser` field to every Express Request so TypeScript
// knows about the property requireAuth() attaches after verifying a token.
declare module 'express-serve-static-core' {
  interface Request {
    jwtUser?: JwtPayload;
  }
}

/**
 * Express middleware that protects a route behind a valid JWT.
 * Expects an `Authorization: Bearer <token>` header. On success, attaches
 * the decoded payload to `req.jwtUser` and calls `next()`; on failure,
 * responds with 401 and does not call `next()`.
 *
 * @param req - Incoming Express request; must carry an Authorization header.
 * @param res - Express response, used to send 401 on missing/invalid tokens.
 * @param next - Express "continue" callback, invoked only when the token is valid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or invalid authorization header' });
    return;
  }

  // Strip the "Bearer " prefix (7 characters) to get the raw token string.
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.jwtUser = payload;
    next();
  } catch {
    // Covers both a malformed token and an expired one — jwt.verify throws for both.
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

/**
 * Signs a new JWT for a given user, used right after a successful Google
 * OAuth login so the frontend can store it and send it on future requests.
 *
 * @param payload - The user id and email to embed in the token.
 * @returns A signed JWT string valid for 7 days.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}
