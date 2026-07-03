import { Router } from "express";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();

router.get("/", async (req, res) => {
  const user = getDbUser(req);
  const [all, unlocked] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({ where: { userId: user.id }, select: { achievementId: true, unlockedAt: true } }),
  ]);

  const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

  res.json(
    all.map((a) => ({
      ...a,
      unlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id) ?? null,
    }))
  );
});

export default router;
