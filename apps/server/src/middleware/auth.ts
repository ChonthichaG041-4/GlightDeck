import { RequestHandler } from "express";
import { clerkMiddleware, clerkClient, getAuth } from "@clerk/express";
import { prisma } from "../db";

/** Verifies the Clerk session on every request (attaches req.auth). */
export const withClerk = clerkMiddleware();

/**
 * Ensures a User row exists in our DB for the authenticated Clerk user,
 * and attaches it to req.dbUser for downstream handlers.
 */
export const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let user = await prisma.user.findUnique({ where: { clerkId: userId } });

    if (!user) {
      // First request from this Clerk user - lazily create the local profile.
      // Deliberately does NOT read email/name off the session JWT's claims
      // (req.auth.sessionClaims) - Clerk does not include the email address
      // there by default (that requires configuring a custom session token
      // template in the Clerk dashboard), so that path was silently falling
      // back to a placeholder email for essentially every single user. Fetch
      // the real user record from Clerk's Backend API instead, which always
      // has it. Still falls back to a placeholder if that call itself fails
      // (e.g. a transient Clerk API hiccup) so sign-in never hard-fails just
      // because this one lookup had a bad moment - see
      // scripts/backfill-user-emails.ts for fixing any account that already
      // ended up with a placeholder email before this fix.
      let email: string | undefined;
      let name = "New Learner";
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
        if (clerkUser.fullName) name = clerkUser.fullName;
      } catch (fetchErr) {
        console.error("[auth] Failed to fetch user details from Clerk, using placeholder email:", fetchErr);
      }
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email: email ?? `${userId}@placeholder.glightdeck.app`,
          name,
        },
      });
    }

    (req as any).dbUser = user;
    next();
  } catch (err) {
    next(err);
  }
};

export function getDbUser(req: any) {
  return req.dbUser as import("@prisma/client").User;
}
