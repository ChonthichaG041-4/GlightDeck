import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

const collectionInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

router.get("/", async (req, res) => {
  const user = getDbUser(req);
  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    include: { _count: { select: { words: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(
    collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      color: c.color,
      wordCount: c._count.words,
      updatedAt: c.updatedAt,
    }))
  );
});

router.post("/", async (req, res) => {
  const user = getDbUser(req);
  const data = collectionInput.parse(req.body);
  const collection = await prisma.collection.create({ data: { ...data, userId: user.id } });
  res.status(201).json(collection);
});

router.patch("/:id", async (req, res) => {
  const user = getDbUser(req);
  const data = collectionInput.partial().parse(req.body);
  const existing = await prisma.collection.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Collection not found" });
  const collection = await prisma.collection.update({ where: { id: req.params.id }, data });
  res.json(collection);
});

router.delete("/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.collection.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Collection not found" });
  await prisma.collection.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
