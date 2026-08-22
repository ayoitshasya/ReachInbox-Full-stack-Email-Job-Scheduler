import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { signToken, requireAuth } from '../middleware/auth';

const router = Router();

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

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${config.frontendUrl}/login?error=oauth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string; email: string } | undefined;
    if (!user) {
      res.redirect(`${config.frontendUrl}/login?error=no_user`);
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
  }
);

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
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
