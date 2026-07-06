import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// GET /api/quiz/generate?type=MULTIPLE_CHOICE|MATCHING|MEANING|SENTENCE|LISTENING&limit=10
router.get("/generate", async (req, res) => {
  const user = getDbUser(req);
  const type = String(req.query.type ?? "MULTIPLE_CHOICE");
  const limit = Number(req.query.limit ?? 10);
  const collectionId = req.query.collectionId as string | undefined;
  const wordIdsParam = req.query.wordIds as string | undefined;
  const wordIds = wordIdsParam ? wordIdsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  // A hand-picked wordIds selection takes priority over collectionId.
  const scopeFilter = wordIds?.length ? { id: { in: wordIds } } : collectionId && collectionId !== "ALL" ? { collectionId } : {};

  const pool = await prisma.word.findMany({
    where: { userId: user.id, ...scopeFilter },
    orderBy: [{ dueDate: "asc" }],
    take: Math.max(limit * 3, 20),
  });

  if (pool.length === 0) return res.json({ type, questions: [] });
  const chosen = shuffle(pool).slice(0, Math.min(limit, pool.length));

  let questions: any[] = [];

  switch (type) {
    case "MULTIPLE_CHOICE": {
      questions = chosen.map((word) => {
        // Dedupe by meaning text (not just word id) - two different words can share
        // the same translation, which previously could produce duplicate options
        // (e.g. two "อบอุ่น" choices) and broke React's key uniqueness on the client.
        const uniqueMeanings = Array.from(
          new Set(pool.filter((w) => w.id !== word.id && w.meaning !== word.meaning).map((w) => w.meaning))
        );
        const distractors = shuffle(uniqueMeanings).slice(0, 3);
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
    case "MEANING": {
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
  type: z.enum(["MULTIPLE_CHOICE", "MATCHING", "MEANING", "SENTENCE", "LISTENING"]),
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
  if (type === "MEANING") {
    await prisma.dailyProgress.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { meaningCount: { increment: total } },
      create: { userId: user.id, date: today, meaningCount: total },
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
