import { prisma } from "../db";
import type { User } from "@prisma/client";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Records today's activity + recomputes the user's current/longest streak.
 *
 * This runs on every /api/* request (see routes/index.ts), so it needs to be
 * cheap. Once a user has already been touched today (the common case - every
 * request after the first one in a session), this is a single in-memory date
 * comparison and nothing else - no DB round trips at all.
 */
export async function touchStreak(user: User): Promise<{ current: number; longest: number } | null> {
  const today = startOfDay(new Date());

  if (user.lastActiveAt && startOfDay(new Date(user.lastActiveAt)).getTime() === today.getTime()) {
    return null; // already recorded today - nothing to do
  }

  try {
    await prisma.streakLog.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today },
    });
  } catch (err: any) {
    // Concurrent requests can both race past the "row doesn't exist yet" check
    // and try to create today's streak row at the same time. One wins, the
    // other gets a unique constraint violation on (userId, date) - that's
    // fine, it just means today is already recorded. Anything else re-throws.
    if (err?.code !== "P2002") throw err;
  }

  const logs = await prisma.streakLog.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 400,
  });

  let current = 0;
  let cursor = today;
  for (const log of logs) {
    const logDate = startOfDay(new Date(log.date));
    if (logDate.getTime() === cursor.getTime()) {
      current += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    } else if (logDate.getTime() < cursor.getTime()) {
      break;
    }
  }

  const longest = Math.max(current, user.longestStreak ?? 0);

  await prisma.user.update({
    where: { id: user.id },
    data: { currentStreak: current, longestStreak: longest, lastActiveAt: new Date() },
  });

  return { current, longest };
}
