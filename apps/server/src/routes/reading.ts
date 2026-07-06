import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { LANG_NAMES } from "../lib/wordLookup";
import { withGeminiRetry, friendlyGeminiError } from "../lib/gemini";

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

// ---------------------------------------------------------------------------
// AI reading-exercise generator - POST /api/reading/generate-exercise
//
// Mirrors the /api/listening/generate-exercise pipeline: Gemini 2.5 Flash writes
// (or, for a user-supplied passage, simply reads) an article at the requested
// CEFR level/length/style, then depending on Test Mode either translates it or
// writes comprehension questions. This is the MVP slice of the full Reading
// redesign - it covers Setup + Generate + a simple read/answer view. The
// deeper "Reading Workspace" (double-click dictionary, highlight/annotate,
// AI-explain-a-sentence) and "Create Mode" (author/publish articles) from the
// full spec are intentionally out of scope for this pass.
// ---------------------------------------------------------------------------

const CEFR = ["AUTO", "A1", "A2", "B1", "B2", "C1", "C2", "MIXED"] as const;
const LENGTHS = ["SHORT", "MEDIUM", "LONG", "CUSTOM"] as const;
const PASSAGE_SOURCES = ["AI_GENERATE", "WRITE_MYSELF", "IMPORT_TEXT"] as const;
const TEST_MODES = ["READING_ONLY", "TRANSLATION", "QUESTIONS", "VOCABULARY", "GRAMMAR", "MIXED"] as const;
const EXAM_MODES = ["GENERAL_ENGLISH", "IELTS", "TOEFL", "TOEIC", "CU_TEP", "TU_GET", "ACADEMIC", "KIDS"] as const;
const STYLES = ["STORY", "NEWS", "CONVERSATION", "EMAIL", "ARTICLE", "BLOG", "RESEARCH", "FANTASY", "BUSINESS", "TRAVEL", "MIXED"] as const;
const CONCRETE_STYLES = STYLES.filter((s) => s !== "MIXED");
const VOCAB_LEVELS = ["AUTO", "SIMPLE", "ACADEMIC", "BUSINESS", "DAILY", "MIXED"] as const;
const GRAMMAR_FOCUS = [
  "PRESENT_SIMPLE", "PAST_TENSE", "FUTURE", "PASSIVE", "CONDITIONALS",
  "RELATIVE_CLAUSE", "REPORTED_SPEECH", "PHRASAL_VERB", "IDIOMS", "MIXED",
] as const;
const CONCRETE_GRAMMAR_FOCUS = GRAMMAR_FOCUS.filter((g) => g !== "MIXED");
const READING_SKILLS = [
  "MAIN_IDEA", "DETAIL", "INFERENCE", "VOCAB_IN_CONTEXT", "TONE",
  "AUTHOR_PURPOSE", "SEQUENCING", "REFERENCE", "GRAMMAR", "MIXED",
] as const;
const CONCRETE_READING_SKILLS = READING_SKILLS.filter((s) => s !== "MIXED");
const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN", "FILL_BLANK", "SHORT_ANSWER", "MATCHING", "ORDERING", "ESSAY", "HIGHLIGHT_SENTENCE", "CLICK_WORD", "MIXED"] as const;
// MATCHING/ORDERING/ESSAY/HIGHLIGHT_SENTENCE/CLICK_WORD don't have an interactive
// UI yet, so if requested they're generated as MULTIPLE_CHOICE for now.
const CONCRETE_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN", "FILL_BLANK", "SHORT_ANSWER"];

const SKILL_LABELS: Record<string, string> = {
  MAIN_IDEA: "Main Idea", DETAIL: "Detail", INFERENCE: "Inference",
  VOCAB_IN_CONTEXT: "Vocabulary in Context", TONE: "Tone", AUTHOR_PURPOSE: "Author's Purpose",
  SEQUENCING: "Sequencing", REFERENCE: "Reference", GRAMMAR: "Grammar", MIXED: "Mixed",
};

const STYLE_LABELS: Record<string, string> = {
  STORY: "Story", NEWS: "News", CONVERSATION: "Conversation", EMAIL: "Email", ARTICLE: "Article",
  BLOG: "Blog", RESEARCH: "Research", FANTASY: "Fantasy", BUSINESS: "Business", TRAVEL: "Travel", MIXED: "Mixed",
};

const VOCAB_LEVEL_GUIDANCE: Record<string, string> = {
  AUTO: "Vocabulary Level: Auto - choose vocabulary appropriate to the CEFR level yourself.",
  SIMPLE: "Vocabulary Level: Simple - use common, everyday words, avoid rare/technical terms.",
  ACADEMIC: "Vocabulary Level: Academic - use formal, academic-register vocabulary.",
  BUSINESS: "Vocabulary Level: Business - use professional/workplace vocabulary.",
  DAILY: "Vocabulary Level: Daily English - use casual, conversational everyday vocabulary.",
  MIXED: "Vocabulary Level: Mixed - naturally blend vocabulary registers.",
};

const GRAMMAR_FOCUS_LABELS: Record<string, string> = {
  PRESENT_SIMPLE: "Present Simple", PAST_TENSE: "Past Tense", FUTURE: "Future", PASSIVE: "Passive Voice",
  CONDITIONALS: "Conditionals", RELATIVE_CLAUSE: "Relative Clauses", REPORTED_SPEECH: "Reported Speech",
  PHRASAL_VERB: "Phrasal Verbs", IDIOMS: "Idioms", MIXED: "Mixed",
};

const LENGTH_GUIDANCE: Record<string, string> = {
  SHORT: "Short: about 200-300 words total.",
  MEDIUM: "Medium: about 400-700 words total.",
  LONG: "Long: about 800-1500 words total.",
  CUSTOM: "", // filled in per-request with the custom word count
};

const CEFR_LABELS: Record<string, string> = {
  AUTO: "Auto", A1: "A1", A2: "A2", B1: "B1", B2: "B2", C1: "C1", C2: "C2", MIXED: "Mixed",
};

const EXAM_MODE_LABELS: Record<string, string> = {
  GENERAL_ENGLISH: "General English", IELTS: "IELTS", TOEFL: "TOEFL", TOEIC: "TOEIC",
  CU_TEP: "CU-TEP", TU_GET: "TU-GET", ACADEMIC: "Academic", KIDS: "Kids",
};

const EXAM_MODE_GUIDANCE: Record<string, string> = {
  GENERAL_ENGLISH: "Exam Mode: General English. No specific exam format - write natural, general-purpose reading material for everyday learning.",
  IELTS: "Exam Mode: IELTS Reading. Match the register and topics of IELTS Reading passages (academic or general training) and phrase questions the way real IELTS Reading questions are phrased.",
  TOEFL: "Exam Mode: TOEFL Reading. Match the register/topics of TOEFL iBT Reading - academic passages from textbooks/journals - with a formal academic register.",
  TOEIC: "Exam Mode: TOEIC Reading. Match the register/topics of TOEIC Reading - workplace emails, memos, notices, articles - with a professional workplace register.",
  CU_TEP: "Exam Mode: CU-TEP Reading. Match the style of Chulalongkorn University Test of English Proficiency (CU-TEP) Reading section - general academic/everyday topics pitched at Thai university-level test takers.",
  TU_GET: "Exam Mode: TU-GET Reading. Match the style of Thammasat University General English Test (TU-GET) Reading section - general academic/everyday topics pitched at Thai university-level test takers.",
  ACADEMIC: "Exam Mode: Academic. Write in a formal academic register - essays, research summaries, textbook-style passages.",
  KIDS: "Exam Mode: Kids. Write in a simple, friendly, age-appropriate register for children/young learners - short sentences, fun topics, encouraging tone.",
};

const generateReadingInput = z
  .object({
    topic: z.string().optional().default(""),
    passageSource: z.enum(PASSAGE_SOURCES).default("AI_GENERATE"),
    manualText: z.string().optional().default(""),
    cefrLevel: z.enum(CEFR).default("AUTO"),
    examMode: z.enum(EXAM_MODES).default("GENERAL_ENGLISH"),
    length: z.enum(LENGTHS).default("MEDIUM"),
    customWordCount: z.number().int().min(50).max(3000).default(500),
    styles: z.array(z.enum(STYLES)).min(1).default(["MIXED"]),
    vocabLevel: z.enum(VOCAB_LEVELS).default("AUTO"),
    grammarFocus: z.array(z.enum(GRAMMAR_FOCUS)).min(1).default(["MIXED"]),
    readingSkills: z.array(z.enum(READING_SKILLS)).min(1).default(["MIXED"]),
    testMode: z.enum(TEST_MODES).default("QUESTIONS"),
    questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).default(["MIXED"]),
    numQuestions: z.number().int().min(1).max(30).default(10),
    targetLang: z.string().default("th"),
  })
  .refine(
    (v) => v.passageSource === "AI_GENERATE" ? v.topic.trim().length > 0 : v.manualText.trim().length > 0,
    { message: "Topic is required for AI Generate, or paste text for Write Myself / Import Text." }
  );

type ReadingInput = z.infer<typeof generateReadingInput>;

const SYSTEM_PROMPT = `You are an experienced ESL reading-material writer. You write natural, well-structured
English reading passages for reading comprehension practice, matching the requested CEFR level,
style, vocabulary level, and exam format closely. Write a short, fitting title for the passage.`;

function buildPassagePrompt(input: ReadingInput): string {
  const cefrLine =
    input.cefrLevel === "AUTO"
      ? "CEFR Level: Auto - choose the most natural, appropriate CEFR level yourself based on the topic (and Exam Mode, if not General English)."
      : input.cefrLevel === "MIXED"
      ? "CEFR Level: Mixed - naturally blend a range of CEFR levels within the passage."
      : `CEFR Level: ${input.cefrLevel}`;

  const lengthLine = input.length === "CUSTOM"
    ? `Length: aim for about ${input.customWordCount} words total.`
    : `Length: ${LENGTH_GUIDANCE[input.length]}`;

  const styles = input.styles.includes("MIXED") ? CONCRETE_STYLES : input.styles;
  const styleLine = `Style: write it as ${styles.map((s) => STYLE_LABELS[s]).join(" / ")}${styles.length > 1 ? " (blend naturally, or pick whichever fits the topic best)" : ""}.`;

  const grammar = input.grammarFocus.includes("MIXED") ? [] : input.grammarFocus;
  const grammarLine = grammar.length
    ? `Naturally incorporate these grammar structures throughout the passage: ${grammar.map((g) => GRAMMAR_FOCUS_LABELS[g]).join(", ")}.`
    : "";

  return `Topic: ${input.topic}
${cefrLine}
${lengthLine}
${styleLine}
${VOCAB_LEVEL_GUIDANCE[input.vocabLevel]}
${grammarLine}
${EXAM_MODE_GUIDANCE[input.examMode]}

Write the reading passage now, plus a short title. Separate paragraphs with a blank line.`;
}

function buildTranslationPrompt(targetLangName: string): string {
  return `Also provide a natural, fluent translation of the ENTIRE passage into ${targetLangName}, preserving paragraph breaks.`;
}

function buildQuestionsPrompt(input: ReadingInput, passageRef: "the passage above" | "the passage below"): string {
  const skills = input.readingSkills.includes("MIXED") ? CONCRETE_READING_SKILLS : input.readingSkills;
  const types = input.questionTypes.includes("MIXED") ? CONCRETE_QUESTION_TYPES : input.questionTypes.filter((t) => t !== "MIXED");
  const concreteTypes = types.length ? types.map((t) => (CONCRETE_QUESTION_TYPES.includes(t) ? t : "MULTIPLE_CHOICE")) : CONCRETE_QUESTION_TYPES;

  let focusLine = `testing these reading skills (distribute questions across them as evenly as reasonable): ${skills.map((s) => SKILL_LABELS[s]).join(", ")}.`;
  if (input.testMode === "VOCABULARY") {
    focusLine = `focused on vocabulary-in-context: ask about the meaning, synonym, or usage of specific words/phrases that actually appear in ${passageRef}.`;
  } else if (input.testMode === "GRAMMAR") {
    const grammar = input.grammarFocus.includes("MIXED") ? CONCRETE_GRAMMAR_FOCUS : input.grammarFocus;
    focusLine = `focused on grammar: test understanding of these structures as used in ${passageRef} (e.g. identify the tense/form, or rephrase correctly): ${grammar.map((g) => GRAMMAR_FOCUS_LABELS[g]).join(", ")}.`;
  } else if (input.testMode === "MIXED") {
    focusLine = `mixing general reading comprehension, vocabulary-in-context, and grammar questions based on ${passageRef}.`;
  }

  return `Then write exactly ${input.numQuestions} questions based only on ${passageRef}, ${focusLine}

Use only these question types: ${concreteTypes.join(", ")}.
- For MULTIPLE_CHOICE: include exactly 4 options with exactly one correct answer.
- For TRUE_FALSE: options must be exactly ["True", "False"].
- For YES_NO_NOTGIVEN: options must be exactly ["Yes", "No", "Not Given"].
- For FILL_BLANK: options must be empty; put the missing word/phrase in "answer".
- For SHORT_ANSWER: options must be empty; put a concise model answer in "answer".
Each question must have "type" set to one of ${CONCRETE_QUESTION_TYPES.join(", ")} (never "MIXED"),
and "skill" set to a specific skill (never "MIXED"). Keep phrasing consistent with the Exam Mode
specified above (${EXAM_MODE_LABELS[input.examMode]}).`;
}

function buildResponseSchema(needsPassage: boolean, testMode: string) {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  if (needsPassage) {
    properties.title = { type: Type.STRING };
    properties.passage = { type: Type.STRING };
    required.push("title", "passage");
  }

  if (testMode === "TRANSLATION") {
    properties.translation = { type: Type.STRING };
    required.push("translation");
  }

  if (testMode === "QUESTIONS" || testMode === "VOCABULARY" || testMode === "GRAMMAR" || testMode === "MIXED") {
    properties.questions = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: CONCRETE_QUESTION_TYPES },
          skill: { type: Type.STRING, enum: [...CONCRETE_READING_SKILLS, "VOCAB_IN_CONTEXT", "GRAMMAR"] },
          prompt: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          answer: { type: Type.STRING },
        },
        required: ["type", "skill", "prompt", "answer"],
      },
    };
    required.push("questions");
  }

  return { type: Type.OBJECT, properties, required };
}

async function callGemini(system: string, user: string, schema: any, apiKey: string): Promise<any> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.6,
      },
    })
  );

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned an empty response");
  return JSON.parse(raw);
}

function deriveTitleFromText(text: string): string {
  const firstLine = text.trim().split("\n")[0] ?? "";
  const words = firstLine.split(/\s+/).slice(0, 8).join(" ");
  return words.length < firstLine.length ? `${words}...` : words || "My Reading";
}

// Saves every generated exercise as a private Article row so the Reading
// Workspace (highlights/notes/bookmarks/progress) and later publishing have
// something persistent to attach to. Owner-only/PRIVATE by default.
async function persistGeneratedArticle(userId: string, input: ReadingInput, exercise: any) {
  return prisma.article.create({
    data: {
      userId,
      title: exercise.title,
      category: "AI Generated",
      content: exercise.passage,
      translation: exercise.translation ?? null,
      questionsJson: exercise.questions ?? undefined,
      examMode: input.examMode,
      cefrLevel: input.cefrLevel,
      testMode: input.testMode,
      visibility: "PRIVATE",
    },
    select: { id: true },
  });
}

/**
 * POST /api/reading/generate-exercise
 * MVP slice of the full Reading redesign: Setup + Generate + a simple read/answer view.
 * passageSource AI_GENERATE calls Gemini to write the passage; WRITE_MYSELF/IMPORT_TEXT use the
 * user's own pasted text directly (skipping passage generation, still using Gemini for
 * translation/questions unless Test Mode is READING_ONLY, which needs no AI call at all).
 * Upload PDF/DOCX and Web Article URL passage sources aren't implemented yet - the frontend
 * doesn't offer them as selectable options.
 */
router.post("/generate-exercise", async (req, res) => {
  try {
    const user = getDbUser(req);
    const input = generateReadingInput.parse(req.body);
    const isManual = input.passageSource === "WRITE_MYSELF" || input.passageSource === "IMPORT_TEXT";
    const needsPassageGen = !isManual;
    const needsAnyAi = needsPassageGen || input.testMode !== "READING_ONLY";

    if (!needsAnyAi) {
      // Manual text + Reading Only: no AI call needed at all.
      const exercise = {
        title: deriveTitleFromText(input.manualText),
        passage: input.manualText.trim(),
      };
      const saved = await persistGeneratedArticle(user.id, input, exercise);
      return res.json({
        source: "manual",
        exercise,
        articleId: saved.id,
        note: "ใช้ข้อความของคุณเอง (ไม่ได้ใช้ AI)",
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!geminiKey) {
      return res.json({
        source: "offline",
        exercise: null,
        note:
          "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) " +
          "ขอคีย์ฟรีได้ที่ aistudio.google.com/apikey แล้ววางใน apps/server/.env จากนั้นรีสตาร์ทเซิร์ฟเวอร์และลองใหม่อีกครั้ง",
      });
    }

    const targetLangName = LANG_NAMES[input.targetLang] ?? input.targetLang;
    let prompt: string;
    const passageRef = needsPassageGen ? "the passage above" : "the passage below";

    if (needsPassageGen) {
      prompt = buildPassagePrompt(input);
    } else {
      prompt = `Here is the reading passage (written by the user):\n\n${input.manualText.trim()}`;
    }

    if (input.testMode === "TRANSLATION") prompt += `\n\n${buildTranslationPrompt(targetLangName)}`;
    if (["QUESTIONS", "VOCABULARY", "GRAMMAR", "MIXED"].includes(input.testMode)) {
      prompt += `\n\n${buildQuestionsPrompt(input, passageRef)}`;
    }

    const schema = buildResponseSchema(needsPassageGen, input.testMode);
    const parsed = await callGemini(SYSTEM_PROMPT, prompt, schema, geminiKey);

    const title = needsPassageGen ? String(parsed?.title ?? "").trim() || "Untitled" : deriveTitleFromText(input.manualText);
    const passage = needsPassageGen ? String(parsed?.passage ?? "").trim() : input.manualText.trim();
    if (!passage) throw new Error("Gemini returned an empty passage");

    const exercise: any = { title, passage };
    if (input.testMode === "TRANSLATION") {
      exercise.translation = String(parsed?.translation ?? "").trim();
    }
    if (["QUESTIONS", "VOCABULARY", "GRAMMAR", "MIXED"].includes(input.testMode)) {
      exercise.questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
        .filter((q: any) => q?.prompt?.trim() && q?.answer?.trim())
        .slice(0, input.numQuestions)
        .map((q: any) => ({
          type: CONCRETE_QUESTION_TYPES.includes(q.type) ? q.type : "MULTIPLE_CHOICE",
          skill: SKILL_LABELS[q.skill] ? q.skill : "DETAIL",
          prompt: String(q.prompt).trim(),
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          answer: String(q.answer).trim(),
        }));
      if (!exercise.questions.length) throw new Error("Gemini returned no usable questions");
    }

    const saved = await persistGeneratedArticle(user.id, input, exercise);

    return res.json({
      source: "ai",
      exercise,
      articleId: saved.id,
      note: `สร้างด้วย Gemini 2.5 Flash · ระดับ ${CEFR_LABELS[input.cefrLevel]} · Exam Mode ${EXAM_MODE_LABELS[input.examMode]}`,
    });
  } catch (err: any) {
    console.error("Gemini reading generate-exercise failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({
        source: "offline",
        exercise: null,
        note: "ข้อมูลที่ส่งมาไม่ถูกต้อง (validation error) - ดู log ฝั่งเซิร์ฟเวอร์สำหรับรายละเอียด",
      });
    }

    return res.json({
      source: "offline",
      exercise: null,
      note: friendlyGeminiError(err, "สร้างบทอ่านด้วย Gemini"),
    });
  }
});

const readingAttemptInput = z.object({
  correctCount: z.number().int().min(0),
  totalCount: z.number().int().min(1),
  articleId: z.string().optional(),
});

// POST /api/reading/attempt - counts a completed generated-reading session toward today's stats
// (separate from /mark-read/:id, which is for the older saved-Article gallery flow). If articleId
// is provided, also logs an ArticleAttempt row so the passage's "Average Score" stat has data.
router.post("/attempt", async (req, res) => {
  try {
    const user = getDbUser(req);
    const { totalCount, correctCount, articleId } = readingAttemptInput.parse(req.body);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.dailyProgress.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { articlesRead: { increment: 1 } },
      create: { userId: user.id, date: today, articlesRead: 1 },
    });
    if (articleId) {
      await prisma.articleAttempt.create({
        data: { articleId, userId: user.id, score: correctCount, total: totalCount },
      });
    }
    res.status(201).json({ ok: true, totalCount });
  } catch (err: any) {
    console.error("Reading attempt failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Reading Workspace + Create Mode + Community
//
// A "passage" is just an Article row (see persistGeneratedArticle above and
// POST /passages below for Create Mode). Highlights/notes/bookmarks/likes/
// ratings/attempts all key off Article.id. Visibility gates read access:
// PRIVATE - owner only, UNLISTED - anyone with the link, PUBLIC - also shows
// up in the Community list.
// ---------------------------------------------------------------------------

function summarizeArticle(article: any, viewerId: string) {
  const likesCount = article.likes?.length ?? 0;
  const liked = article.likes?.some((l: any) => l.userId === viewerId) ?? false;
  const ratings: number[] = (article.ratings ?? []).map((r: any) => r.rating);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const myRating = (article.ratings ?? []).find((r: any) => r.userId === viewerId)?.rating ?? null;
  const attempts: { score: number; total: number }[] = article.attempts ?? [];
  const avgScore = attempts.length
    ? Math.round((attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length) * 100)
    : null;

  return {
    id: article.id,
    title: article.title,
    category: article.category,
    content: article.content,
    translation: article.translation,
    questions: article.questionsJson ?? null,
    examMode: article.examMode,
    cefrLevel: article.cefrLevel,
    testMode: article.testMode,
    visibility: article.visibility,
    viewCount: article.viewCount,
    createdAt: article.createdAt,
    authorId: article.userId,
    authorName: article.user?.name ?? "Learner",
    isOwner: article.userId === viewerId,
    stats: {
      views: article.viewCount,
      likes: likesCount,
      liked,
      attempts: attempts.length,
      avgScorePercent: avgScore,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      ratingCount: ratings.length,
      myRating,
    },
    highlights: article.highlights ?? [],
    notes: article.notes ?? [],
    bookmarks: article.readingBookmarks ?? [],
  };
}

const PASSAGE_INCLUDE = {
  user: { select: { name: true } },
  likes: { select: { userId: true } },
  ratings: { select: { userId: true, rating: true } },
  attempts: { select: { score: true, total: true } },
  highlights: { orderBy: { startOffset: "asc" as const } },
  notes: { orderBy: { createdAt: "asc" as const } },
  readingBookmarks: { orderBy: { createdAt: "asc" as const } },
};

// GET /api/reading/passages/:id - fetch a saved passage (own, or PUBLIC/UNLISTED).
// Increments the view counter on every fetch except when the owner is viewing.
router.get("/passages/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const article: any = await prisma.article.findUnique({
      where: { id: req.params.id },
      include: PASSAGE_INCLUDE,
    });
    if (!article) return res.status(404).json({ error: "Passage not found" });
    if (article.userId !== user.id && article.visibility === "PRIVATE") {
      return res.status(403).json({ error: "This passage is private" });
    }

    if (article.userId !== user.id) {
      await prisma.article.update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } });
      article.viewCount += 1;
    }
    // Scope highlights/notes/bookmarks to the viewer - these are personal annotations.
    article.highlights = article.highlights.filter((h: any) => h.userId === user.id);
    article.notes = article.notes.filter((n: any) => n.userId === user.id);
    article.readingBookmarks = article.readingBookmarks.filter((b: any) => b.userId === user.id);

    res.json(summarizeArticle(article, user.id));
  } catch (err: any) {
    console.error("Get passage failed:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const updatePassageInput = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  questions: z.array(z.any()).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC", "UNLISTED"]).optional(),
});

// PATCH /api/reading/passages/:id - owner-only: rename, edit content/questions, publish/unpublish.
router.patch("/passages/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = updatePassageInput.parse(req.body);
    const existing = await prisma.article.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Passage not found" });

    const updated = await prisma.article.update({
      where: { id: existing.id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.content ? { content: data.content } : {}),
        ...(data.questions ? { questionsJson: data.questions } : {}),
        ...(data.visibility ? { visibility: data.visibility } : {}),
      },
    });
    res.json({ id: updated.id, visibility: updated.visibility });
  } catch (err: any) {
    console.error("Update passage failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

const createPassageInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().default("My Passage"),
  questions: z.array(z.any()).optional(),
});

// POST /api/reading/passages - Create Mode: save a self-authored passage as a new draft.
router.post("/passages", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = createPassageInput.parse(req.body);
    const article = await prisma.article.create({
      data: {
        userId: user.id,
        title: data.title,
        category: data.category,
        content: data.content,
        questionsJson: data.questions ?? undefined,
        visibility: "PRIVATE",
      },
    });
    res.status(201).json({ id: article.id });
  } catch (err: any) {
    console.error("Create passage failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

// GET /api/reading/community - browse PUBLIC passages from every user.
router.get("/community", async (req, res) => {
  try {
    const user = getDbUser(req);
    const articles: any[] = await prisma.article.findMany({
      where: { visibility: "PUBLIC" },
      include: PASSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(
      articles.map((a) => {
        const s = summarizeArticle(a, user.id);
        // Community list view doesn't need the full body/annotations - keep it light.
        return { ...s, content: s.content.slice(0, 220), highlights: [], notes: [], bookmarks: [] };
      })
    );
  } catch (err: any) {
    console.error("Get community failed:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const highlightInput = z.object({
  text: z.string().min(1),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.string().optional(),
});

router.post("/passages/:id/highlights", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = highlightInput.parse(req.body);
    const highlight = await prisma.highlight.create({
      data: { articleId: req.params.id, userId: user.id, ...data },
    });
    res.status(201).json(highlight);
  } catch (err: any) {
    console.error("Create highlight failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

router.delete("/highlights/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const existing = await prisma.highlight.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Highlight not found" });
    await prisma.highlight.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const noteInput = z.object({
  text: z.string().min(1),
  anchorText: z.string().optional(),
  anchorOffset: z.number().int().min(0).optional(),
});

router.post("/passages/:id/notes", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = noteInput.parse(req.body);
    const note = await prisma.note.create({
      data: { articleId: req.params.id, userId: user.id, ...data },
    });
    res.status(201).json(note);
  } catch (err: any) {
    console.error("Create note failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

router.delete("/notes/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Note not found" });
    await prisma.note.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const bookmarkInput = z.object({
  anchorText: z.string().optional(),
  anchorOffset: z.number().int().min(0).default(0),
});

// POST /api/reading/passages/:id/bookmarks - toggle a bookmark at this anchor for the current user.
router.post("/passages/:id/bookmarks", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = bookmarkInput.parse(req.body);
    const existing = await prisma.readingBookmark.findUnique({
      where: {
        articleId_userId_anchorOffset: { articleId: req.params.id, userId: user.id, anchorOffset: data.anchorOffset },
      },
    });
    if (existing) {
      await prisma.readingBookmark.delete({ where: { id: existing.id } });
      return res.json({ bookmarked: false });
    }
    await prisma.readingBookmark.create({
      data: { articleId: req.params.id, userId: user.id, anchorText: data.anchorText, anchorOffset: data.anchorOffset },
    });
    res.json({ bookmarked: true });
  } catch (err: any) {
    console.error("Toggle bookmark failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

// POST /api/reading/passages/:id/like - toggle like for the current user.
router.post("/passages/:id/like", async (req, res) => {
  try {
    const user = getDbUser(req);
    const existing = await prisma.articleLike.findUnique({
      where: { articleId_userId: { articleId: req.params.id, userId: user.id } },
    });
    if (existing) {
      await prisma.articleLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.articleLike.create({ data: { articleId: req.params.id, userId: user.id } });
    }
    const likesCount = await prisma.articleLike.count({ where: { articleId: req.params.id } });
    res.json({ liked: !existing, likesCount });
  } catch (err: any) {
    console.error("Toggle like failed:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const ratingInput = z.object({ rating: z.number().int().min(1).max(5) });

// POST /api/reading/passages/:id/rating - upsert a 1-5 star rating for the current user.
router.post("/passages/:id/rating", async (req, res) => {
  try {
    const user = getDbUser(req);
    const { rating } = ratingInput.parse(req.body);
    await prisma.articleRating.upsert({
      where: { articleId_userId: { articleId: req.params.id, userId: user.id } },
      update: { rating },
      create: { articleId: req.params.id, userId: user.id, rating },
    });
    const all = await prisma.articleRating.findMany({ where: { articleId: req.params.id }, select: { rating: true } });
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    res.json({ myRating: rating, avgRating: Math.round(avg * 10) / 10, ratingCount: all.length });
  } catch (err: any) {
    console.error("Submit rating failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;
