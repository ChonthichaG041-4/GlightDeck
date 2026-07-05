import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { LANG_NAMES } from "../lib/wordLookup";
import { withGeminiRetry, friendlyGeminiError } from "../lib/gemini";

const router = Router();

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// GET /api/listening/session?mode=choice|dictation&limit=10
router.get("/session", async (req, res) => {
  const user = getDbUser(req);
  const limit = Number(req.query.limit ?? 10);
  const mode = (req.query.mode as string) ?? "choice";
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

  if (pool.length === 0) return res.json({ mode, questions: [] });

  const chosen = shuffle(pool).slice(0, Math.min(limit, pool.length));

  const questions = chosen.map((word) => {
    if (mode === "dictation") {
      return { wordId: word.id, headword: word.headword, meaning: word.meaning, audioText: word.headword };
    }
    const distractorPool = pool.filter((w) => w.id !== word.id);
    const distractors = shuffle(distractorPool).slice(0, 3).map((w) => w.headword);
    const options = shuffle([word.headword, ...distractors]);
    return { wordId: word.id, audioText: word.headword, options, answer: word.headword };
  });

  res.json({ mode, questions });
});

const attemptInput = z.object({
  correctCount: z.number().int().min(0),
  totalCount: z.number().int().min(1),
});

router.post("/attempt", async (req, res) => {
  const user = getDbUser(req);
  const { correctCount, totalCount } = attemptInput.parse(req.body);

  await prisma.quizAttempt.create({
    data: { user