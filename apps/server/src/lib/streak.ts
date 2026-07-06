import { prisma } from "../db";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Records today's activity + recomputes the user's current/longest streak. */
export async function touchStreak(userId: string): Promise<{ current: number; longest: number }> {
  const today = startOfDay(new Date());

  try {
    await prisma.streakLog.upsert({
      where: { userId_date: { userId, date: today } },
      update: {},
      create: { userId, date: today },
    });
  } catch (err: any) {
    // Concurrent requests (e.g. several API calls firing on page load) can both
    // race past the "row doesn't exist yet" check and try to create today's
    // streak row at the same time. One wins, the other gets a unique constraint
    // violation on (userId, date) — that's fine, it just means today is already
    // recorded, so ignore it. Anything else should still bubble up.
    if (err?.code !== "P2002") throw err;
  }

  const logs = await prisma.streakLog.findMany({
    where: { userId },
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

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const longest = Math.max(current, user?.longestStreak ?? 0);

  await prisma.user.update({
    where: { id: userId },
    data: { currentStreak: current, longestStreak: longest, lastActiveAt: new Date() },
  });

  return { current, longest };
}
