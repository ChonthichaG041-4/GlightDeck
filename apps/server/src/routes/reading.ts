import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

const articleInput = z.object({
  title: z.string().min(1),
  category: z.string().default("Reading"),
  content: z.string().min(1),
  source: z.string().optional(),
});

router.get("/articles", async (req, res) => {
  const user = getDbUser(req);
  const { category } = req.query as Record<string, string>;
  const articles = await prisma.article.findMany({
    where: { userId: user.id, ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, category: true, source: true, createdAt: true },
  });
  res.json(articles);
});

router.get("/articles/:id", async (req, res) => {
  const user = getDbUser(req);
  const article = await prisma.article.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

router.post("/articles", async (req, res) => {
  const user = getDbUser(req);
  const data = articleInput.parse(req.body);
  const article = await prisma.article.create({ data: { ...data, userId: user.id } });
  res.status(201).json(article);
});

router.delete("/articles/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.article.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Article not found" });
  await prisma.article.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// POST /api/reading/mark-read/:id -> counts toward today's "Reading" stat
router.post("/mark-read/:id", async (req, res) => {
  const user = getDbUser(req);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.dailyProgress.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: { articlesRead: { increment: 1 } },
    create: { userId: user.id, date: today, articlesRead: 1 },
  });
  res.json({ ok: true });
});

export default router;
