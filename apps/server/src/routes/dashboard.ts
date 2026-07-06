import { Router } from "express";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

router.get("/home", async (req, res) => {
  const user = getDbUser(req);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [wordsToReview, newWords, progress, collections] = await Promise.all([
    prisma.word.count({ where: { userId: user.id, dueDate: { lte: new Date() }, status: { not: "NEW" } } }),
    prisma.word.count({ where: { userId: user.id, status: "NEW" } }),
    prisma.dailyProgress.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
    prisma.collection.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { words: true } } },
    }),
  ]);

  res.json({
    greetingName: user.name ?? "Learner",
    wordsToReview,
    newWords,
    listening: progress?.listeningCount ?? 0,
    readingArticles: progress?.articlesRead ?? 0,
    streak: user.currentStreak,
    dailyChallenge: {
      review: { done: progress?.reviewCount ?? 0, target: progress?.reviewTarget ?? 20 },
      listening: { done: progress?.listeningCount ?? 0, target: progress?.listeningTarget ?? 10 },
      meaning: { done: progress?.meaningCount ?? 0, target: progress?.meaningTarget ?? 10 },
      sentence: { done: progress?.sentenceCount ?? 0, target: progress?.sentenceTarget ?? 5 },
    },
    recentCollections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      wordCount: c._count.words,
    })),
  });
});

export default router;
