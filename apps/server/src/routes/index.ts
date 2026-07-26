import { Router } from "express";
import { requireUser } from "../middleware/auth";
import { touchStreak } from "../lib/streak";

import wordsRouter from "./words";
import lookupRouter from "./lookup";
import collectionsRouter from "./collections";
import tagsRouter from "./tags";
import flashcardsRouter from "./flashcards";
import listeningRouter from "./listening";
import readingRouter from "./reading";
import quizRouter from "./quiz";
import statsRouter from "./stats";
import aiRouter from "./ai";
import importRouter from "./importRoutes";
import sentencesRouter from "./sentences";
import achievementsRouter from "./achievements";
import relationsRouter from "./relations";
import dashboardRouter from "./dashboard";

const router = Router();

// Every /api/* route requires an authenticated + synced local user,
// and touching any endpoint counts toward today's streak. Streak bookkeeping
// is a no-op after the first request of the day (see touchStreak) and isn't
// needed to serve the response, so it runs in the background instead of
// blocking every single API call on it.
router.use(requireUser, (req, _res, next) => {
  touchStreak((req as any).dbUser).catch((err) => {
    console.error("touchStreak failed:", err);
  });
  next();
});

router.use("/words/lookup", lookupRouter);
router.use("/words", wordsRouter);
router.use("/collections", collectionsRouter);
router.use("/tags", tagsRouter);
router.use("/flashcards", flashcardsRouter);
router.use("/listening", listeningRouter);
router.use("/reading", readingRouter);
router.use("/quiz", quizRouter);
router.use("/stats", statsRouter);
router.use("/ai", aiRouter);
router.use("/import", importRouter);
router.use("/sentences", sentencesRouter);
router.use("/achievements", achievementsRouter);
router.use("/relations", relationsRouter);
router.use("/dashboard", dashboardRouter);

export default router;
