import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

const input = z.object({
  text: z.string().min(1),
  translation: z.string().optional(),
  wordId: z.string().optional(),
});

router.get("/", async (req, res) => {
  const user = getDbUser(req);
  const sentences = await prisma.sentenceBookmark.findMany({
    where: { userId: user.id },
    include: { word: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(sentences);
});

router.post("/", async (req, res) => {
  const user = getDbUser(req);
  const data = input.parse(req.body);
  const sentence = await prisma.sentenceBookmark.create({ data: { ...data, userId: user.id } });
  res.status(201).json(sentence);
});

router.delete("/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.sentenceBookmark.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Sentence not found" });
  await prisma.sentenceBookmark.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
