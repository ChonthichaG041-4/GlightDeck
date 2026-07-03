import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

const tagInput = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

router.get("/", async (req, res) => {
  const user = getDbUser(req);
  const tags = await prisma.tag.findMany({
    where: { userId: user.id },
    include: { _count: { select: { words: true } } },
    orderBy: { name: "asc" },
  });
  res.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color, wordCount: t._count.words })));
});

router.post("/", async (req, res) => {
  const user = getDbUser(req);
  const data = tagInput.parse(req.body);
  const tag = await prisma.tag.create({ data: { ...data, userId: user.id } });
  res.status(201).json(tag);
});

router.delete("/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.tag.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Tag not found" });
  await prisma.tag.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
