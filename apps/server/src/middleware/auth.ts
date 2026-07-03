import { RequestHandler } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
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
      // In production this is normally done via a Clerk webhook (see routes/webhooks.ts)
      // but lazy-creation keeps local dev friction-free.
      const clerkUser = (req as any).auth?.sessionClaims ?? {};
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email: clerkUser.email ?? `${userId}@placeholder.lingodeck.app`,
          name: clerkUser.name ?? "New Learner",
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
