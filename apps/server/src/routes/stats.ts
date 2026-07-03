import { Router } from "express";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

router.get("/", async (req, res) => {
  const user = getDbUser(req);

  const [total, mastered, learning, review, newWords, attempts] = await Promise.all([
    prisma.word.count({ where: { userId: user.id } }),
    prisma.word.count({ where: { userId: user.id, status: "MASTERED" } }),
    prisma.word.count({ where: { userId: user.id, status: "LEARNING" } }),
    prisma.word.count({ where: { userId: user.id, status: "REVIEW" } }),
    prisma.word.count({ where: { userId: user.id, status: "NEW" } }),
    prisma.quizAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const forgotten = await prisma.word.count({ where: { userId: user.id, lapses: { gte: 4 } } });

  const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
  const totalPossible = attempts.reduce((sum, a) => sum + a.total, 0);
  const accuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  // last 14 days review activity for the bar chart
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const logs = await prisma.reviewLog.findMany({
    where: { userId: user.id, reviewedAt: { gte: since } },
    select: { reviewedAt: true, rating: true },
  });

  const byDay: Record<string, number> = {};
  for (const log of logs) {
    const key = log.reviewedAt.toISOString().slice(0, 10);
    byDay[key] = (byDay[key] ?? 0) + 1;
  }

  res.json({
    wordsLearned: total,
    mastered,
    learning,
    review,
    newWords,
    forgotten,
    accuracy,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    reviewActivity: Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    breakdown: [
      { name: "Learning", value: learning },
      { name: "Review", value: review },
      { name: "Mastered", value: mastered },
    ],
  });
});

export default router;
