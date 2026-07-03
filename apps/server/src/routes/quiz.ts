import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// GET /api/quiz/generate?type=MULTIPLE_CHOICE|MATCHING|TYPING|SENTENCE|LISTENING&limit=10
router.get("/generate", async (req, res) => {
  const user = getDbUser(req);
  const type = String(req.query.type ?? "MULTIPLE_CHOICE");
  const limit = Number(req.query.limit ?? 10);
  const collectionId = req.query.collectionId as string | undefined;
  const collectionFilter = collectionId && collectionId !== "ALL" ? { collectionId } : {};

  const pool = await prisma.word.findMany({
    where: { userId: user.id, ...collectionFilter },
    orderBy: [{ dueDate: "asc" }],
    take: Math.max(limit * 3, 20),
  });

  if (pool.length === 0) return res.json({ type, questions: [] });
  const chosen = shuffle(pool).slice(0, Math.min(limit, pool.length));

  let questions: any[] = [];

  switch (type) {
    case "MULTIPLE_CHOICE": {
      questions = chosen.map((word) => {
        const distractors = shuffle(pool.filter((w) => w.id !== word.id)).slice(0, 3).map((w) => w.meaning);
        return {
          wordId: word.id,
          prompt: word.headword,
          options: shuffle([word.meaning, ...distractors]),
          answer: word.meaning,
        };
      });
      break;
    }
    case "MATCHING": {
      const pairs = chosen.slice(0, Math.min(6, chosen.length));
      questions = [
        {
          left: pairs.map((w) => ({ id: w.id, text: w.headword })),
          right: shuffle(pairs.map((w) => ({ id: w.id, text: w.meaning }))),
        },
      ];
      break;
    }
    case "TYPING": {
      questions = chosen.map((word) => ({ wordId: word.id, prompt: word.meaning, answer: word.headword }));
      break;
    }
    case "SENTENCE": {
      questions = chosen
        .filter((w) => w.example && w.example.toLowerCase().includes(w.headword.toLowerCase()))
        .map((word) => ({
          wordId: word.id,
          sentence: word.example!.replace(new RegExp(word.headword, "i"), "_____"),
          answer: word.headword,
        }));
      break;
    }
    case "LISTENING": {
      questions = chosen.map((word) => ({ wordId: word.id, audioText: word.headword, answer: word.headword }));
      break;
    }
    default:
      return res.status(400).json({ error: "Unknown quiz type" });
  }

  res.json({ type, questions });
});

const submitInput = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "MATCHING", "TYPING", "SENTENCE", "LISTENING"]),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  wrongWordIds: z.array(z.string()).optional(),
});

router.post("/submit", async (req, res) => {
  const user = getDbUser(req);
  const { type, score, total, wrongWordIds } = submitInput.parse(req.body);

  const attempt = await prisma.quizAttempt.create({
    data: { userId: user.id, type, score, total },
  });

  if (wrongWordIds?.length) {
    await prisma.word.updateMany({
      where: { id: { in: wrongWordIds }, userId: user.id },
      data: { lapses: { increment: 1 } },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "TYPING") {
    await prisma.dailyProgress.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { typingCount: { increment: total } },
      create: { userId: user.id, date: today, typingCount: total },
    });
  } else if (type === "SENTENCE") {
    await prisma.dailyProgress.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { sentenceCount: { increment: total } },
      create: { userId: user.id, date: today, sentenceCount: total },
    });
  }

  res.status(201).json(attempt);
});

export default router;
