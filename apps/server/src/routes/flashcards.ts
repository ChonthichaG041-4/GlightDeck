import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { scheduleReview } from "../lib/srs";
import { serializeWord } from "./words";

const router = Router();

// GET /api/flashcards/queue?limit=20 -> due + new words for today's session
router.get("/queue", async (req, res) => {
  const user = getDbUser(req);
  const limit = Number(req.query.limit ?? 20);
  const collectionId = req.query.collectionId as string | undefined;
  const collectionFilter = collectionId && collectionId !== "ALL" ? { collectionId } : {};

  const due = await prisma.word.findMany({
    where: { userId: user.id, dueDate: { lte: new Date() }, status: { not: "NEW" }, ...collectionFilter },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: { tags: { include: { tag: true } }, collection: true },
  });

  const remaining = Math.max(0, limit - due.length);
  const fresh = remaining
    ? await prisma.word.findMany({
        where: { userId: user.id, status: "NEW", ...collectionFilter },
        orderBy: { createdAt: "asc" },
        take: remaining,
        include: { tags: { include: { tag: true } }, collection: true },
      })
    : [];

  res.json({
    dueCount: due.length,
    newCount: fresh.length,
    cards: [...due, ...fresh].map(serializeWord),
  });
});

const reviewInput = z.object({
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
});

router.post("/:wordId/review", async (req, res) => {
  const user = getDbUser(req);
  const { rating } = reviewInput.parse(req.body);

  const word = await prisma.word.findFirst({ where: { id: req.params.wordId, userId: user.id } });
  if (!word) return res.status(404).json({ error: "Word not found" });

  const result = scheduleReview(
    {
      easeFactor: word.easeFactor,
      intervalDays: word.intervalDays,
      repetitions: word.repetitions,
      lapses: word.lapses,
      status: word.status,
    },
    rating
  );

  const updated = await prisma.word.update({
    where: { id: word.id },
    data: {
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      lapses: result.lapses,
      status: result.status,
      dueDate: result.dueDate,
      lastReviewedAt: new Date(),
    },
  });

  await prisma.reviewLog.create({
    data: {
      wordId: word.id,
      userId: user.id,
      rating,
      intervalDays: result.intervalDays,
      easeFactor: result.easeFactor,
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.dailyProgress.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: { reviewCount: { increment: 1 } },
    create: { userId: user.id, date: today, reviewCount: 1 },
  });

  res.json(serializeWord(updated));
});

export default router;
