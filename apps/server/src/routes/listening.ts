import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { LANG_NAMES } from "../lib/wordLookup";

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
    data: { userId: user.id, type: "LISTENING", score: correctCount, total: totalCount },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.dailyProgress.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: { listeningCount: { increment: totalCount } },
    create: { userId: user.id, date: today, listeningCount: totalCount },
  });

  res.status(201).json({ ok: true });
});

// ---------------------------------------------------------------------------
// AI listening-exercise generator - POST /api/listening/generate-exercise
//
// Gemini 2.5 Flash writes a natural, spoken-style passage at the requested
// CEFR level/length/paragraph count, then (depending on Test Mode) either a
// fluent translation of the whole passage, or a set of comprehension
// questions targeting the requested listening skills/question types.
// Voice/accent/speaking-speed are playback-only settings handled entirely on
// the client via the Web Speech API - they don't affect generation.
// ---------------------------------------------------------------------------

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LENGTHS = ["SHORT", "MEDIUM", "LONG"] as const;
const TEST_MODES = ["TRANSLATION", "QUESTIONS"] as const;
const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER", "MIXED"] as const;
const CONCRETE_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER"];
const ASSESSMENT_SKILLS = [
  "GIST", "DETAILS", "INFERENCE", "ATTITUDE_EMOTION", "SPEAKERS_PURPOSE", "SEQUENCING",
  "VOCAB_IN_CONTEXT", "INFORMATION_CONNECTIONS", "SUMMARIZING", "FOLLOWING_INSTRUCTIONS", "MIXED",
] as const;
const CONCRETE_SKILLS = ASSESSMENT_SKILLS.filter((s) => s !== "MIXED");

const SKILL_LABELS: Record<string, string> = {
  GIST: "Listening for Gist",
  DETAILS: "Listening for Details",
  INFERENCE: "Inference",
  ATTITUDE_EMOTION: "Attitude & Emotion",
  SPEAKERS_PURPOSE: "Speaker's Purpose",
  SEQUENCING: "Sequencing",
  VOCAB_IN_CONTEXT: "Vocabulary from Context",
  INFORMATION_CONNECTIONS: "Information Connections",
  SUMMARIZING: "Summarizing",
  FOLLOWING_INSTRUCTIONS: "Following Instructions",
  MIXED: "Mixed Skills",
};

const LENGTH_GUIDANCE: Record<string, string> = {
  SHORT: "Short: about 50-80 words per paragraph.",
  MEDIUM: "Medium: about 90-140 words per paragraph.",
  LONG: "Long: about 150-220 words per paragraph.",
};

const generateExerciseInput = z.object({
  topic: z.string().min(1),
  cefrLevel: z.enum(CEFR).default("B1"),
  paragraphs: z.number().int().min(1).max(6).default(2),
  length: z.enum(LENGTHS).default("MEDIUM"),
  assessmentSkills: z.array(z.enum(ASSESSMENT_SKILLS)).min(1).default(["MIXED"]),
  testMode: z.enum(TEST_MODES).default("QUESTIONS"),
  questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).default(["MIXED"]),
  numQuestions: z.number().int().min(1).max(20).default(5),
  targetLang: z.string().default("th"),
});

const SYSTEM_PROMPT = `You are an experienced ESL listening-exercise writer.
You write natural, spoken-style English passages for listening comprehension practice - the kind
a teacher would record for a class, not a written essay. Match the requested CEFR level closely:
vocabulary, grammar, and sentence length must all be appropriate for that level. Sound like a real
person speaking (a monologue, a short talk, an announcement, or a dialogue - whichever fits the
topic best).`;

function buildPassagePrompt(input: z.infer<typeof generateExerciseInput>): string {
  return `Topic: ${input.topic}
CEFR Level: ${input.cefrLevel}
Paragraphs: exactly ${input.paragraphs}
Length per paragraph: ${LENGTH_GUIDANCE[input.length]}

Write the listening passage now. Separate paragraphs with a blank line. Do not add a title or any
labels like "Paragraph 1" - just the spoken text itself.`;
}

function buildTranslationPrompt(targetLangName: string): string {
  return `Also provide a natural, fluent translation of the ENTIRE passage into ${targetLangName}, preserving paragraph breaks.`;
}

function buildQuestionsPrompt(input: z.infer<typeof generateExerciseInput>): string {
  const skills = input.assessmentSkills.includes("MIXED")
    ? CONCRETE_SKILLS
    : input.assessmentSkills;
  const types = input.questionTypes.includes("MIXED")
    ? CONCRETE_QUESTION_TYPES
    : input.questionTypes;

  return `Then write exactly ${input.numQuestions} comprehension questions based only on the passage above,
testing these listening skills (distribute questions across them as evenly as reasonable):
${skills.map((s) => `- ${SKILL_LABELS[s]}`).join("\n")}

Use only these question types: ${types.join(", ")}.
- For MULTIPLE_CHOICE: include exactly 4 options with exactly one correct answer.
- For TRUE_FALSE: options must be exactly ["True", "False"].
- For FILL_BLANK: options must be empty; put the missing word/phrase in "answer".
- For SHORT_ANSWER: options must be empty; put a concise model answer in "answer".
Each question must have "type" set to one of MULTIPLE_CHOICE, TRUE_FALSE, FILL_BLANK, SHORT_ANSWER
(never "MIXED" itself - that just means freely mix the concrete types above), and "skill" set to
the specific skill it tests (never "MIXED").`;
}

function buildResponseSchema(testMode: string) {
  const properties: Record<string, any> = {
    transcript: { type: Type.STRING },
  };
  const required = ["transcript"];

  if (testMode === "TRANSLATION") {
    properties.translation = { type: Type.STRING };
    required.push("translation");
  }

  if (testMode === "QUESTIONS") {
    properties.questions = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: CONCRETE_QUESTION_TYPES },
          skill: { type: Type.STRING, enum: CONCRETE_SKILLS },
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
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.6,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned an empty response");
  return JSON.parse(raw);
}

/**
 * POST /api/listening/generate-exercise
 * { topic, cefrLevel, paragraphs, length, assessmentSkills, testMode, questionTypes, numQuestions, targetLang }
 * Generates a fresh AI listening passage (+ translation or comprehension questions, depending on
 * Test Mode) for the custom Listening practice builder. Gemini-only, no free/offline fallback -
 * mirrors the /api/ai/generate-set pipeline design.
 */
router.post("/generate-exercise", async (req, res) => {
  const input = generateExerciseInput.parse(req.body);
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!geminiKey) {
    return res.json({
      source: "offline",
      exercise: null,
      note:
        "ฟีเจอร์นี้ต้องใช้ Gemini API ในการสร้างบทฟัง (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) " +
        "ขอคีย์ฟรีได้ที่ aistudio.google.com/apikey แล้ววางใน apps/server/.env จากนั้นรีสตาร์ทเซิร์ฟเวอร์และลองใหม่อีกครั้ง",
    });
  }

  try {
    const targetLangName = LANG_NAMES[input.targetLang] ?? input.targetLang;
    let prompt = buildPassagePrompt(input);
    if (input.testMode === "TRANSLATION") prompt += `\n\n${buildTranslationPrompt(targetLangName)}`;
    if (input.testMode === "QUESTIONS") prompt += `\n\n${buildQuestionsPrompt(input)}`;

    const schema = buildResponseSchema(input.testMode);
    const parsed = await callGemini(SYSTEM_PROMPT, prompt, schema, geminiKey);

    const transcript = String(parsed?.transcript ?? "").trim();
    if (!transcript) throw new Error("Gemini returned an empty transcript");

    const exercise: any = { transcript };
    if (input.testMode === "TRANSLATION") {
      exercise.translation = String(parsed?.translation ?? "").trim();
    }
    if (input.testMode === "QUESTIONS") {
      exercise.questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
        .filter((q: any) => q?.prompt?.trim() && q?.answer?.trim())
        .slice(0, input.numQuestions)
        .map((q: any) => ({
          type: CONCRETE_QUESTION_TYPES.includes(q.type) ? q.type : "SHORT_ANSWER",
          skill: CONCRETE_SKILLS.includes(q.skill) ? q.skill : "DETAILS",
          prompt: String(q.prompt).trim(),
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          answer: String(q.answer).trim(),
        }));
      if (!exercise.questions.length) throw new Error("Gemini returned no usable questions");
    }

    return res.json({ source: "ai", exercise, note: `สร้างด้วย Gemini 2.5 Flash · ระดับ ${input.cefrLevel}` });
  } catch (err) {
    console.error("Gemini generate-exercise failed", err);
    return res.json({
      source: "offline",
      exercise: null,
      note:
        "สร้างบทฟังด้วย Gemini ไม่สำเร็จ (เชื่อมต่อ Gemini API ไม่ได้ หรือคีย์ไม่ถูกต้อง/หมดโควต้า) " +
        "กรุณาตรวจสอบ GEMINI_API_KEY ในไฟล์ apps/server/.env แล้วลองใหม่อีกครั้ง",
    });
  }
});

export default router;
