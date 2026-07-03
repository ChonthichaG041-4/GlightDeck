import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

// GET /api/relations/:wordId -> mindmap chain (word -> related -> related...)
router.get("/:wordId", async (req, res) => {
  const user = getDbUser(req);
  const word = await prisma.word.findFirst({
    where: { id: req.params.wordId, userId: user.id },
    include: {
      relationsFrom: { include: { to: true } },
      relationsTo: { include: { from: true } },
    },
  });
  if (!word) return res.status(404).json({ error: "Word not found" });

  res.json({
    id: word.id,
    headword: word.headword,
    related: [
      ...word.relationsFrom.map((r) => ({ id: r.to.id, headword: r.to.headword, label: r.label })),
      ...word.relationsTo.map((r) => ({ id: r.from.id, headword: r.from.headword, label: r.label })),
    ],
  });
});

const input = z.object({ fromId: z.string(), toId: z.string(), label: z.string().optional() });

router.post("/", async (req, res) => {
  const { fromId, toId, label } = input.parse(req.body);
  const relation = await prisma.wordRelation.create({ data: { fromId, toId, label } });
  res.status(201).json(relation);
});

export default router;
