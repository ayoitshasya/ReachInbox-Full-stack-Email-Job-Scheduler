// Express router handling authentication: Google OAuth login/callback,
// fetching the current user, and logout. Mounted at /api/auth in
// backend/src/index.ts. Uses Passport's Google strategy for the OAuth
// handshake, then issues our own JWT (see middleware/auth.ts) so the rest
// of the API doesn't need to depend on Passport sessions.
import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { signToken, requireAuth } from '../middleware/auth';

const router = Router();

// Registers the Google OAuth 2.0 strategy with Passport. This callback runs
// after Google confirms the user's identity, and is responsible for turning
// a Google profile into (or matching it to) a row in our own User table.
passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('no email in google profile'));

        // upsert: first-time Google sign-in creates the user; returning
        // users get their name/avatar refreshed in case they changed on Google's side.
        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value,
          },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value,
          },
        });

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

// Step 1 of the OAuth flow: redirects the browser to Google's consent
// screen, requesting the "profile" and "email" scopes. `session: false`
// because we don't use server-side sessions — see the JWT hand-off below.
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Step 2: Google redirects back here after the user grants/denies access.
// Passport verifies the response, runs the GoogleStrategy callback above,
// and on success attaches the resulting user to req.user.
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${config.frontendUrl}/login?error=oauth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string; email: string } | undefined;
    if (!user) {
      res.redirect(`${config.frontendUrl}/login?error=no_user`);
      return;
    }

    // Hand off from OAuth to our own auth system: issue a JWT and send the
    // browser back to the frontend with the token in the URL, where the
    // frontend's AuthCallback page picks it up and stores it.
    const token = signToken({ userId: user.id, email: user.email });
    res.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
  }
);

// Returns the profile of whichever user the JWT in the Authorization header
// belongs to. Used by the frontend on load to check "who am I logged in as".
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.jwtUser!.userId },
      select: { id: true, email: true, name: true, avatar: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'failed to fetch user' });
  }
});

router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  // jwt is stateless — client just needs to drop the token
  res.json({ message: 'logged out' });
});

export default router;
