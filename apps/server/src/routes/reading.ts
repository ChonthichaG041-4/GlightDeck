import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import { marked } from "marked";
import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { LANG_NAMES } from "../lib/wordLookup";
import { withGeminiRetry, friendlyGeminiError } from "../lib/gemini";
import { blocksToPlainText, randomBlockId, type Block } from "../lib/blocks";
import { callOpenRouterVision, withOpenRouterRetry, friendlyOpenRouterError, extractJsonObject } from "../lib/openrouter";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Import Book/Reading (OCR): a handful of page photos, each can be a bit larger than a
// typical DOCX/PDF upload (phone camera photos), and there can be several pages at once.
const uploadImages = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 12 } });

const articleInput = z.object({
  title: z.string().min(1),
  category: z.string().default("Reading"),
  content: z.string().min(1),
  source: z.string().optional(),
});

// My Articles: Category is intentionally NOT a filter here (Category is a
// Community-browsing concept per the Articles-hub IA) - instead: search
// (title), tags (comma-separated, matches any), studyListId (membership),
// status (DRAFT/PUBLISHED/ARCHIVED), and sort (newest default/oldest/title).
// `category` query param is still accepted server-side (harmless, used
// nowhere in the new UI) so nothing else calling this endpoint breaks.
router.get("/articles", async (req, res) => {
  const user = getDbUser(req);
  const { category, search, tags, studyListId, status, sort } = req.query as Record<string, string>;
  const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const orderBy =
    sort === "oldest" ? { createdAt: "asc" as const } :
    sort === "title" ? { title: "asc" as const } :
    { createdAt: "desc" as const };

  const articles = await prisma.article.findMany({
    where: {
      userId: user.id,
      ...(category ? { category } : {}),
      ...(status ? { status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
      ...(tagList.length ? { tags: { hasSome: tagList } } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
      ...(studyListId ? { studyLists: { some: { studyListId } } } : {}),
    },
    orderBy,
    select: {
      id: true, title: true, category: true, source: true, createdAt: true,
      visibility: true, status: true, tags: true, cefrLevel: true,
      studyLists: { select: { studyListId: true } },
    },
  });
  res.json(articles.map(({ studyLists, ...a }) => ({ ...a, studyListIds: studyLists.map((s) => s.studyListId) })));
});

// ---------------------------------------------------------------------------
// Study Lists - user-created groupings of their own articles (My Articles).
// Deliberately separate from Category (which stays Community-only): one
// article can sit in multiple lists via the StudyListArticle join table.
// ---------------------------------------------------------------------------

const studyListInput = z.object({ name: z.string().min(1) });

router.get("/study-lists", async (req, res) => {
  const user = getDbUser(req);
  const lists = await prisma.studyList.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, _count: { select: { articles: true } } },
  });
  res.json(lists.map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt, articleCount: l._count.articles })));
});

router.post("/study-lists", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = studyListInput.parse(req.body);
    const list = await prisma.studyList.create({ data: { name: data.name, userId: user.id } });
    res.status(201).json({ id: list.id, name: list.name, createdAt: list.createdAt, articleCount: 0 });
  } catch (err: any) {
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

router.patch("/study-lists/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = studyListInput.parse(req.body);
    const existing = await prisma.studyList.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Study list not found" });
    const updated = await prisma.studyList.update({ where: { id: existing.id }, data: { name: data.name } });
    res.json({ id: updated.id, name: updated.name });
  } catch (err: any) {
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

router.delete("/study-lists/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.studyList.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Study list not found" });
  await prisma.studyList.delete({ where: { id: existing.id } });
  res.status(204).end();
});

const studyListArticleInput = z.object({ articleId: z.string().min(1) });

router.post("/study-lists/:id/articles", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = studyListArticleInput.parse(req.body);
    const list = await prisma.studyList.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!list) return res.status(404).json({ error: "Study list not found" });
    const article = await prisma.article.findFirst({ where: { id: data.articleId, userId: user.id } });
    if (!article) return res.status(404).json({ error: "Article not found" });
    await prisma.studyListArticle.upsert({
      where: { studyListId_articleId: { studyListId: list.id, articleId: article.id } },
      create: { studyListId: list.id, articleId: article.id },
      update: {},
    });
    res.status(201).json({ ok: true });
  } catch (err: any) {
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

router.delete("/study-lists/:id/articles/:articleId", async (req, res) => {
  const user = getDbUser(req);
  const list = await prisma.studyList.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!list) return res.status(404).json({ error: "Study list not found" });
  await prisma.studyListArticle.deleteMany({ where: { studyListId: list.id, articleId: req.params.articleId } });
  res.status(204).end();
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
// MATCHING/ORDERING are authored manually via the Create Mode Question Builder
// (their pairs/items shape doesn't fit this flat prompt/options/answer schema) -
// HIGHLIGHT_SENTENCE/CLICK_WORD still don't have an interactive UI, so if
// requested they're generated as MULTIPLE_CHOICE for now.
const CONCRETE_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN", "FILL_BLANK", "SHORT_ANSWER", "ESSAY"];

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
    description: z.string().optional().default(""),
    tags: z.array(z.string()).optional().default([]),
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
- For ESSAY: options must be empty; put a short model answer / grading rubric note in "answer" (the reader writes free text - not auto-graded).
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
      description: input.description || undefined,
      tags: input.tags ?? [],
      contentSource: "AI_GENERATE",
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
    description: article.description ?? null,
    tags: article.tags ?? [],
    contentSource: article.contentSource ?? null,
    blocks: article.blocksJson ?? null,
    vocabularyMode: article.vocabularyMode ?? "NONE",
    vocabulary: article.vocabularyJson ?? null,
    translation: article.translation,
    questions: article.questionsJson ?? null,
    examMode: article.examMode,
    cefrLevel: article.cefrLevel,
    testMode: article.testMode,
    visibility: article.visibility,
    status: article.status,
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

// POST /api/reading/passages/:id/duplicate - clone any article the caller can
// currently read (their own, or someone else's PUBLIC/UNLISTED one) into a
// new PRIVATE article they own. Used by the Article Detail page's "Duplicate"
// action - handy both for "make a backup before editing" and for "save a copy
// of this community article into my own library".
router.post("/passages/:id/duplicate", async (req, res) => {
  try {
    const user = getDbUser(req);
    const article: any = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: "Article not found" });
    if (article.userId !== user.id && article.visibility === "PRIVATE") {
      return res.status(403).json({ error: "This article is private" });
    }

    const copy = await prisma.article.create({
      data: {
        userId: user.id,
        title: `Copy of ${article.title}`,
        category: article.category,
        content: article.content,
        source: article.source,
        description: article.description,
        tags: article.tags ?? [],
        contentSource: article.contentSource,
        blocksJson: article.blocksJson ?? undefined,
        vocabularyMode: article.vocabularyMode,
        vocabularyJson: article.vocabularyJson ?? undefined,
        translation: article.translation,
        questionsJson: article.questionsJson ?? undefined,
        examMode: article.examMode,
        cefrLevel: article.cefrLevel,
        testMode: article.testMode,
        visibility: "PRIVATE",
      },
      select: { id: true },
    });
    res.status(201).json({ id: copy.id });
  } catch (err: any) {
    console.error("Duplicate article failed:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

const CONTENT_SOURCES = ["AI_GENERATE", "WRITE_MANUALLY", "PASTE_TEXT", "IMPORT_DOCX", "IMPORT_PDF", "IMPORT_MARKDOWN", "IMPORT_BOOK"] as const;
const VOCAB_MODES = ["AUTO", "MANUAL", "NONE"] as const;
const vocabularyItemSchema = z.object({ headword: z.string().min(1), meaning: z.string().default(""), ipa: z.string().nullable().optional() });
const blockSchema = z.any(); // rich-block shape validated loosely - see lib/blocks.ts Block union

const updatePassageInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  content: z.string().min(1).optional(),
  translation: z.string().optional(),
  blocks: z.array(blockSchema).optional(),
  contentSource: z.enum(CONTENT_SOURCES).optional(),
  cefrLevel: z.string().optional(),
  testMode: z.string().optional(),
  vocabularyMode: z.enum(VOCAB_MODES).optional(),
  vocabulary: z.array(vocabularyItemSchema).optional(),
  questions: z.array(z.any()).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC", "UNLISTED"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

// PATCH /api/reading/passages/:id - owner-only: rename, edit content/questions, publish/unpublish,
// change status (Draft/Published/Archived - My Articles). Publishing (visibility -> PUBLIC)
// implicitly marks status PUBLISHED too unless the caller explicitly sent a status of its own,
// so the existing "Publish" UI (which only ever sends visibility) doesn't need to change.
router.patch("/passages/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = updatePassageInput.parse(req.body);
    const existing = await prisma.article.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Passage not found" });

    // If blocks were sent, they're the source of truth - keep the plain-text
    // `content` mirror in sync automatically so nothing else needs to change.
    const content = data.blocks ? blocksToPlainText(data.blocks as Block[]) : data.content;

    const updated = await prisma.article.update({
      where: { id: existing.id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.tags ? { tags: data.tags } : {}),
        ...(content ? { content } : {}),
        ...(data.translation !== undefined ? { translation: data.translation } : {}),
        ...(data.blocks ? { blocksJson: data.blocks } : {}),
        ...(data.contentSource ? { contentSource: data.contentSource } : {}),
        ...(data.cefrLevel ? { cefrLevel: data.cefrLevel } : {}),
        ...(data.testMode ? { testMode: data.testMode } : {}),
        ...(data.vocabularyMode ? { vocabularyMode: data.vocabularyMode } : {}),
        ...(data.vocabulary ? { vocabularyJson: data.vocabulary } : {}),
        ...(data.questions ? { questionsJson: data.questions } : {}),
        ...(data.visibility ? { visibility: data.visibility } : {}),
        ...(data.status ? { status: data.status } : data.visibility === "PUBLIC" ? { status: "PUBLISHED" as const } : {}),
      },
    });
    res.json({ id: updated.id, visibility: updated.visibility, status: updated.status });
  } catch (err: any) {
    console.error("Update passage failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: err?.message ?? "Internal server error" });
  }
});

const createPassageInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  translation: z.string().optional(),
  blocks: z.array(blockSchema).optional(),
  category: z.string().default("My Passage"),
  tags: z.array(z.string()).optional(),
  contentSource: z.enum(CONTENT_SOURCES).optional(),
  cefrLevel: z.string().optional(),
  testMode: z.string().optional(),
  vocabularyMode: z.enum(VOCAB_MODES).optional(),
  vocabulary: z.array(vocabularyItemSchema).optional(),
  questions: z.array(z.any()).optional(),
}).refine((v) => (v.blocks && v.blocks.length > 0) || !!v.content?.trim(), {
  message: "Provide either blocks or content",
});

// POST /api/reading/passages - Create Mode: save a self-authored passage as a new draft.
router.post("/passages", async (req, res) => {
  try {
    const user = getDbUser(req);
    const data = createPassageInput.parse(req.body);
    const content = data.blocks?.length ? blocksToPlainText(data.blocks as Block[]) : (data.content ?? "").trim();
    if (!content) return res.status(400).json({ error: "Passage has no content" });

    const article = await prisma.article.create({
      data: {
        userId: user.id,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags ?? [],
        content,
        translation: data.translation,
        blocksJson: data.blocks ?? undefined,
        contentSource: data.contentSource,
        cefrLevel: data.cefrLevel,
        testMode: data.testMode,
        vocabularyMode: data.vocabularyMode ?? "NONE",
        vocabularyJson: data.vocabulary ?? undefined,
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

// ---------------------------------------------------------------------------
// Create Mode: import an existing document as blocks - POST /api/reading/import/*
//
// Each returns { title, blocks, content } (content is the flattened plain-text
// mirror, same as everywhere else) so the frontend can drop the result straight
// into the Block Editor. These are best-effort text/structure extractions, not
// pixel-perfect document conversion:
//   - DOCX: mammoth extracts the raw text; paragraph-split into PARAGRAPH blocks.
//   - PDF: pdf-parse extracts raw text; paragraph-split into PARAGRAPH blocks.
//   - Markdown: `marked`'s lexer gives real structured tokens, so headings,
//     blockquotes, code fences, and horizontal rules map directly to their
//     matching block types (the richest of the three imports).
// "Import Book/Reading" (OCR from test-paper images) is intentionally not
// implemented yet - a future pass.
// ---------------------------------------------------------------------------

function deriveTitleFromParagraphs(paragraphs: string[]): string {
  const firstLine = (paragraphs[0] ?? "").trim();
  const words = firstLine.split(/\s+/).slice(0, 8).join(" ");
  return words.length < firstLine.length ? `${words}...` : words || "Imported Passage";
}

function paragraphsToBlocks(text: string): Block[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n/g, " ").trim())
    .filter(Boolean)
    .map((p) => ({ id: randomBlockId(), type: "PARAGRAPH" as const, text: p }));
}

router.post("/import/docx", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { value: text } = await mammoth.extractRawText({ buffer: req.file.buffer });
    const blocks = paragraphsToBlocks(text);
    if (!blocks.length) return res.status(400).json({ error: "ไม่พบข้อความในไฟล์ DOCX นี้" });
    res.json({ title: deriveTitleFromParagraphs(blocks.map((b: any) => b.text)), blocks, content: blocksToPlainText(blocks) });
  } catch (err: any) {
    console.error("DOCX import failed:", err?.message ?? err);
    res.status(500).json({ error: "แปลงไฟล์ DOCX ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/import/pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const pdfParse = (await import("pdf-parse")).default;
    const { text } = await pdfParse(req.file.buffer);
    const blocks = paragraphsToBlocks(text);
    if (!blocks.length) return res.status(400).json({ error: "ไม่พบข้อความในไฟล์ PDF นี้ (อาจเป็นไฟล์สแกนภาพ - ยังไม่รองรับ OCR)" });
    res.json({ title: deriveTitleFromParagraphs(blocks.map((b: any) => b.text)), blocks, content: blocksToPlainText(blocks) });
  } catch (err: any) {
    console.error("PDF import failed:", err?.message ?? err);
    res.status(500).json({ error: "แปลงไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
  }
});

const importMarkdownInput = z.object({ text: z.string().min(1) });

router.post("/import/markdown", async (req, res) => {
  try {
    const { text } = importMarkdownInput.parse(req.body);
    const tokens = marked.lexer(text);
    const blocks: Block[] = [];

    for (const token of tokens as any[]) {
      switch (token.type) {
        case "heading":
          blocks.push({ id: randomBlockId(), type: "HEADING", level: Math.min(3, Math.max(1, token.depth)) as 1 | 2 | 3, text: token.text });
          break;
        case "paragraph":
          if (token.text?.trim()) blocks.push({ id: randomBlockId(), type: "PARAGRAPH", text: token.text });
          break;
        case "blockquote": {
          const quoteText = (token.tokens ?? []).map((t: any) => t.text ?? "").join(" ").trim() || token.text || "";
          if (quoteText) blocks.push({ id: randomBlockId(), type: "QUOTE", text: quoteText });
          break;
        }
        case "code":
          blocks.push({ id: randomBlockId(), type: "CODE", code: token.text ?? "", language: token.lang || undefined });
          break;
        case "hr":
          blocks.push({ id: randomBlockId(), type: "DIVIDER" });
          break;
        case "table": {
          const header: string[] = (token.header ?? []).map((c: any) => c.text ?? String(c));
          const rows: string[][] = (token.rows ?? []).map((row: any[]) => row.map((c: any) => c.text ?? String(c)));
          blocks.push({ id: randomBlockId(), type: "TABLE", rows: [header, ...rows] });
          break;
        }
        case "list": {
          const items = (token.items ?? []).map((it: any) => `- ${it.text ?? ""}`).join("\n");
          if (items.trim()) blocks.push({ id: randomBlockId(), type: "PARAGRAPH", text: items });
          break;
        }
        default:
          break; // space, html, def, etc. - skipped
      }
    }

    if (!blocks.length) return res.status(400).json({ error: "ไม่พบเนื้อหาที่แปลงได้ในข้อความ Markdown นี้" });
    res.json({
      title: deriveTitleFromParagraphs(blocks.filter((b) => b.type === "HEADING" || b.type === "PARAGRAPH").map((b: any) => b.text)),
      blocks,
      content: blocksToPlainText(blocks),
    });
  } catch (err: any) {
    console.error("Markdown import failed:", err?.message ?? err);
    res.status(err?.name === "ZodError" ? 400 : 500).json({ error: "แปลง Markdown ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
  }
});

// ---------------------------------------------------------------------------
// Import Book/Reading (OCR) - POST /api/reading/import/book
//
// "Document Structure Parser" pipeline, condensed into a single multimodal
// vision-language model call instead of a separate OCR + layout + parser
// stage-by-stage service. Runs on OpenRouter + Qwen2.5-VL (see lib/openrouter.ts)
// rather than Gemini - a deliberate per-feature choice (Import Book/Reading's
// per-page-image cost adds up fastest of any AI feature here, and a free vision
// model is a good fit for it specifically). Every other AI feature in this app
// still runs on Gemini - this is the only route that doesn't. Backs the
// multi-step Import Wizard on the frontend (Upload -> Review Pages -> AI
// Processing -> Review Results -> Save):
//   1. Image Understanding - every uploaded page photo is sent in ONE request,
//      so the model treats them as pages of a single exercise, not separate docs.
//   2-4. OCR + Layout + Semantic Parsing - the model reads the text, classifies
//      blocks (title/instruction/passage/question/options/header/footer/page
//      number - the last three are discarded), and builds title -> instruction
//      -> passage paragraphs -> question list (stem + options) in one pass.
//   5. Question Type Classification - MCQ / Short Answer / Gap Fill / True-
//      False(-Not Given) / Matching / Ordering / Summary Completion, following
//      the same rules spelled out in the prompt below.
//   6. Metadata - exercise title, stated reading level (if any), instruction.
//   7. Passage split into paragraphs (kept separate from the flat blocks so
//      word-highlighting downstream still works exactly like every other
//      Content Source).
//   8. Output mapped onto the SAME shapes the rest of Create Mode already
//      uses - Block[] for the Editor, ReadingQuestion[] for the Question
//      Builder - plus an "Educational Analysis" tagging layer (skill,
//      difficulty) added on top of (not instead of) the structural parse, so
//      structure parsing and pedagogical tagging stay decoupled per-question.
// Also returns a self-reported "confidence" estimate (0-100, the model's own
// read on how legible/complete the pages were) purely for the wizard's
// Review Results summary - not a true OCR-engine confidence score.
//
// No response_format/json_schema is requested (unlike the Gemini routes in
// this file) - OpenRouter's structured-outputs support isn't guaranteed across
// whichever backend ends up serving a free-tier model request, and an
// unsupported strict schema would hard-fail the call. Instead the exact JSON
// shape is spelled out in the prompt itself and parsed defensively.
// ---------------------------------------------------------------------------

const BOOK_QUESTION_TYPES = [
  "MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN", "FILL_BLANK",
  "SHORT_ANSWER", "ESSAY", "MATCHING", "ORDERING",
] as const;

const BOOK_IMPORT_SYSTEM_PROMPT = `You are a document-structure parser for English reading-exercise books and exam papers
(IELTS/TOEFL/TOEIC/school textbook style). You are given one or more page photos/scans that
together form ONE reading exercise - treat every image as a page of the SAME document, in the
order given, never as separate unrelated exercises.

Your job has two layers, and you must keep them conceptually separate even though you return them
together:
1. STRUCTURE PARSING - OCR the pages, detect layout blocks (title, subtitle, instruction, passage
   paragraphs, question stems, answer options/choices, answer lines, matching columns, headers,
   footers, page numbers), discard headers/footers/page numbers, and build a clean semantic tree:
   title -> instruction -> passage paragraphs -> ordered question list (stem + options).
2. EDUCATIONAL ANALYSIS - a separate tagging pass on top of the structure: for every question,
   tag which reading/language skill it tests and how difficult it is. This tagging must never
   change how a question was structurally parsed.

Always reply with ONLY a single valid JSON object matching the exact shape described in the user
message - no markdown code fences, no commentary, no text before or after the JSON.`;

const BOOK_IMPORT_JSON_SHAPE = `Reply with ONLY a single JSON object with exactly this shape (no markdown fences, no extra text):
{
  "title": string,
  "level": string | null,
  "instruction": string | null,
  "confidence": number (0-100),
  "article": { "paragraphs": string[] },
  "questions": [
    {
      "number": number,
      "type": one of ${JSON.stringify(BOOK_QUESTION_TYPES)},
      "skill": string,
      "difficulty": one of ["A1","A2","B1","B2","C1","C2"],
      "prompt": string,
      "options": string[],
      "answer": string,
      "pairs": [{ "left": string, "right": string }] (MATCHING only, omit otherwise),
      "items": string[] (ORDERING only, omit otherwise)
    }
  ]
}`;

const BOOK_IMPORT_USER_PROMPT = `Parse the attached page image(s) as a single reading exercise.

1. Merge all pages into one logical document. The pages are not necessarily in reading order and
   are not necessarily adjacent in the source book - workbooks commonly print the answer key for
   an exercise in a completely different section (often near the front of the book, titled
   "Answer <exercise/level name>") from the exercise's own passage and question pages. Treat every
   uploaded image as belonging to this ONE exercise regardless of where in the book it came from -
   never treat an answer-key page as a second, separate exercise.
2. Extract metadata: the exercise title (if present), the reading/grade level if explicitly
   stated on the page (e.g. "Reading Comprehension Level 3" -> "Level 3"), and the instruction
   line(s) telling the reader what to do (e.g. "Read the following passage."). Use null for any
   of these that genuinely aren't present - never invent text that isn't on the page.
3. Extract the passage/article text, split into paragraphs exactly as they appear (preserve
   paragraph breaks; merge line-wraps within one paragraph into a single continuous string).
4. Extract every question in order, numbered as printed. For each, decide its type with these
   rules:
   - Numbered stem followed by lettered/numbered choices (a/b/c/d or A/B/C/D) with one correct
     answer -> MULTIPLE_CHOICE.
   - Stem followed by a blank writing line, no choices given -> SHORT_ANSWER.
   - A sentence with a gap ("____") to fill in with a missing word/phrase -> FILL_BLANK.
   - Choices are exactly True/False -> TRUE_FALSE. Choices are True/False/Not Given or
     Yes/No/Not Given -> YES_NO_NOTGIVEN.
   - Two columns of items to be matched to each other -> MATCHING (return the correct pairs as
     {left, right}).
   - Items/events to be placed in the correct order/sequence -> ORDERING (return "items" already
     in the correct order).
   - "Complete the summary" with several blanks referencing the passage -> return one FILL_BLANK
     question per blank, in reading order.
   - A free-response/opinion prompt with no single correct answer -> ESSAY.
4a. ANSWER KEY PAGES - if any uploaded page is an answer key/answer sheet (typically titled
   "Answer <exercise or level name>", listing answers by question number, sometimes under an
   "Exercise N" sub-heading), it is NOT a separate exercise to import and must NEVER be turned
   into extra questions of its own. Its only purpose is supplying the correct "answer" text for
   the matching question numbers of the SAME exercise you are extracting:
   - If the answer-key page groups answers under multiple exercise numbers/headings (e.g.
     "Exercise 6", "Exercise 7", "Exercise 8" all on one page), use only the block whose heading
     matches this exercise (matched by exercise number/name if printed anywhere on the passage or
     question pages, otherwise by matching the count/order of questions); ignore the other blocks.
   - Match answer-key entries to questions strictly by printed question number (answer-key #3 ->
     question #3), not by position on the page.
   - Always prefer the answer-key's text for a question's "answer" field over what is written on
     the question page itself, especially when the question page only shows a blank writing line
     or empty box with no legible handwritten answer - the answer key is the authoritative source
     of the correct answer in that case.
   - If an answer key explicitly says something like "Other answers with the same context are also
     acceptable" before a numbered list, still use that numbered list as the model "answer" for
     each matching question (it is the expected/reference answer, not a discouraged one).
   - Only leave "answer" as an empty string if truly no answer-key content exists anywhere in the
     uploaded images for that question number.
5. Educational Analysis - for every question, in addition to (not instead of) the structural
   fields above, add:
   - skill: the specific reading/language skill being tested, e.g. "Main Idea", "Detail",
     "Inference", "Vocabulary in Context", "Tone", "Reading Comprehension", "Grammar".
   - difficulty: your best estimate of the CEFR level (A1, A2, B1, B2, C1, or C2) for that
     question/passage, based on its vocabulary and structure. Always provide your best estimate -
     do not return null for this field even if no level is printed on the page.
6. Also return "confidence": your own 0-100 estimate of how legible and complete the source
   images were (100 = perfectly clear, nothing ambiguous; lower if blurry/cut off/hard to read).
7. Only use information that is actually visible in the images - if the images are blurry or a
   field truly isn't present, use null for that field (except "skill"/"difficulty"/"confidence",
   which always need your best-effort estimate) rather than guessing content that isn't there.

${BOOK_IMPORT_JSON_SHAPE}`;

router.post("/import/book", uploadImages.array("images", 12), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ error: "กรุณาอัปโหลดภาพอย่างน้อย 1 หน้า" });

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return res.status(400).json({
        error:
          "ฟีเจอร์นี้ต้องใช้ OpenRouter API (ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY บนเซิร์ฟเวอร์) " +
          "ขอคีย์ฟรีได้ที่ openrouter.ai/keys แล้ววางใน apps/server/.env จากนั้นรีสตาร์ทเซิร์ฟเวอร์และลองใหม่อีกครั้ง",
      });
    }

    const raw = await withOpenRouterRetry(() =>
      callOpenRouterVision({
        systemPrompt: BOOK_IMPORT_SYSTEM_PROMPT,
        userText: BOOK_IMPORT_USER_PROMPT,
        images: files.map((f) => ({ mimeType: f.mimetype || "image/jpeg", base64: f.buffer.toString("base64") })),
        apiKey: openRouterKey,
      })
    );

    let parsed: any;
    try {
      parsed = extractJsonObject(raw);
    } catch (parseErr: any) {
      console.error("Book import (OCR): model response was not valid JSON.");
      console.error("Raw response:", parseErr?.rawResponse ?? raw);
      return res.status(502).json({
        error:
          "AI ตอบกลับไม่ใช่ JSON ที่ถูกต้อง กรุณาลองใหม่อีกครั้ง (โมเดลฟรีบางตัวตอบไม่ตรงรูปแบบเป็นครั้งคราว - ลองใหม่มักจะได้โมเดลอื่น)",
      });
    }

    const paragraphs: string[] = Array.isArray(parsed?.article?.paragraphs)
      ? parsed.article.paragraphs.map((p: any) => String(p).trim()).filter(Boolean)
      : [];
    if (!paragraphs.length) {
      return res.status(400).json({ error: "ไม่พบเนื้อหาบทความในภาพที่อัปโหลด ลองใหม่อีกครั้งด้วยภาพที่ชัดเจนกว่านี้" });
    }

    const blocks: Block[] = paragraphs.map((p) => ({ id: randomBlockId(), type: "PARAGRAPH" as const, text: p }));

    const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
      .filter((q: any) => q?.prompt?.trim() && q?.type)
      .map((q: any) => {
        const type = (BOOK_QUESTION_TYPES as readonly string[]).includes(q.type) ? q.type : "MULTIPLE_CHOICE";
        const question: any = {
          type,
          skill: q.skill ? String(q.skill).trim() : "Reading Comprehension",
          difficulty: q.difficulty ? String(q.difficulty).trim() : undefined,
          prompt: String(q.prompt).trim(),
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          answer: String(q.answer ?? "").trim(),
        };
        if (type === "MATCHING" && Array.isArray(q.pairs)) {
          question.pairs = q.pairs.map((p: any) => ({ left: String(p?.left ?? "").trim(), right: String(p?.right ?? "").trim() }));
        }
        if (type === "ORDERING" && Array.isArray(q.items)) {
          question.items = q.items.map((it: any) => String(it).trim());
        }
        return question;
      });

    res.json({
      title: (String(parsed?.title ?? "").trim() || deriveTitleFromParagraphs(paragraphs)),
      level: parsed?.level ? String(parsed.level).trim() : null,
      instruction: parsed?.instruction ? String(parsed.instruction).trim() : null,
      confidence: Number.isFinite(parsed?.confidence) ? Math.min(100, Math.max(0, Math.round(parsed.confidence))) : null,
      pagesProcessed: files.length,
      blocks,
      content: blocksToPlainText(blocks),
      questions,
    });
  } catch (err: any) {
    console.error("Book import (OCR) failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    res.status(500).json({ error: friendlyOpenRouterError(err, "นำเข้าภาพหนังสือ/ข้อสอบด้วย AI") });
  }
});

// GET /api/reading/community - browse PUBLIC passages from every user.
// Supports search (title), category, difficulty (cefrLevel exact match),
// tags (comma-separated, matches any), and sort (latest default / popular =
// most-liked). Category/Difficulty/Tags are Community-only filters per the
// Articles-hub IA (My Articles uses Study Lists/Tags/status instead).
router.get("/community", async (req, res) => {
  try {
    const user = getDbUser(req);
    const { search, category, difficulty, tags, sort } = req.query as Record<string, string>;
    const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const orderBy = sort === "popular" ? { likes: { _count: "desc" as const } } : { createdAt: "desc" as const };

    const articles: any[] = await prisma.article.findMany({
      where: {
        visibility: "PUBLIC",
        status: { not: "ARCHIVED" },
        ...(category ? { category } : {}),
        ...(difficulty ? { cefrLevel: difficulty } : {}),
        ...(tagList.length ? { tags: { hasSome: tagList } } : {}),
        ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
      },
      include: PASSAGE_INCLUDE,
      orderBy,
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

const noteUpdateInput = z.object({
  text: z.string().min(1),
});

// Used by the floating Note tool's autosave - the same note row is updated in
// place as the user types/draws instead of creating a new row on every change.
router.patch("/notes/:id", async (req, res) => {
  try {
    const user = getDbUser(req);
    const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!existing) return res.status(404).json({ error: "Note not found" });
    const data = noteUpdateInput.parse(req.body);
    const updated = await prisma.note.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (err: any) {
    console.error("Update note failed:", err?.message ?? err);
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
