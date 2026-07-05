import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { LANG_NAMES, WORD_TYPES, freeDictionaryLookup, freeDictionaryFullLookup, KAIKKI_POS_MAP } from "../lib/wordLookup";
import { withGeminiRetry, friendlyGeminiError } from "../lib/gemini";
import { prisma } from "../db";

const router = Router();

const explainInput = z.object({
  text: z.string().min(1),
});

/**
 * POST /api/ai/explain { text: "Take off" }
 * Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise returns a
 * clearly-labelled offline placeholder so the UI keeps working in local dev.
 */
router.post("/explain", async (req, res) => {
  const { text } = explainInput.parse(req.body);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.json({
      source: "offline",
      meaning: `(Set ANTHROPIC_API_KEY to get a real explanation) "${text}" — add your API key in apps/server/.env.`,
      example: "-",
      usage: "-",
      contrast: "-",
    });
  }

  try {
    const prompt = `Explain the English word or phrase "${text}" for a Thai learner. Reply strictly as JSON with keys: meaning (Thai), example (English sentence), usage (when to use it, in Thai), contrast (how it differs from a commonly confused word, in Thai).`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data: any = await response.json();
    const raw = data?.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    res.json({ source: "ai", ...parsed });
  } catch (err) {
    console.error("AI explain failed", err);
    res.status(502).json({ error: "AI assistant is temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// AI vocabulary-set generator - POST /api/ai/generate-set
//
// Pipeline (no more Datamuse-based free fallback):
//   User -> Gemini 2.5 Flash -> Structured JSON (Word, IPA, POS, CEFR, Meaning)
//        -> (optional, English source only) Dictionary API -> verify IPA -> Show
//
// Gemini (GEMINI_API_KEY / GOOGLE_API_KEY) does 100% of the generation - word
// choice, IPA, part of speech, CEFR level, example, and translations. If the
// source language is English, dictionaryapi.dev is used afterwards purely as
// a cross-check to correct/confirm the IPA Gemini produced (never to generate
// or replace words). There is no other data source: without a Gemini key, or
// if the Gemini call fails, the endpoint returns no words and an explanatory
// message instead of silently degrading to a lower-quality alternate source.
// ---------------------------------------------------------------------------

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "MIXED"] as const;
const STYLES = ["TEXTBOOK", "CONVERSATION", "TRAVEL", "BUSINESS", "ACADEMIC", "IELTS", "TOEIC", "KIDS", "RANDOM"] as const;
const SCOPES = ["BASIC", "STANDARD", "COMPLETE", "NATIVE"] as const;
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const generateSetInput = z.object({
  topic: z.string().min(1),
  sourceLang: z.string().default("en"),
  targetLangs: z.array(z.string()).min(1).default(["th"]),
  cefrLevel: z.enum(CEFR_LEVELS).default("MIXED"),
  style: z.enum(STYLES).default("TEXTBOOK"),
  scope: z.enum(SCOPES).default("STANDARD"),
  count: z.number().int().min(5).max(60).default(20),
});

interface GeneratedWord {
  headword: string;
  ipa: string | null;
  type: string;
  level: string | null;
  example: string | null;
  translations: Record<string, string>;
}

// System prompt - fixed "experienced teacher" persona. Verbatim per spec.
const SYSTEM_PROMPT = `You are an experienced English teacher.
Your task is NOT to brainstorm random related words.
Your task is to build vocabulary exactly like an English textbook.
Think like Cambridge, Oxford, Longman or English File.
The vocabulary must be:
- commonly taught
- frequently used
- useful in daily conversation
- organized by topic
- appropriate for CEFR
- natural collocations
- no obscure technical words
- no random synonyms
- no words that native speakers rarely use
Prioritize words that teachers introduce when teaching this topic.
Never generate words only because they are semantically related.
Instead ask:
"If I were teaching this topic in class,
what words would students actually learn?"
Return vocabulary in teaching order.`;

// Per-CEFR-level "Avoid" constraint blocks - verbatim per spec.
const CEFR_GUIDANCE: Record<string, string> = {
  A1: `Vocabulary Level: A1
Only generate vocabulary appropriate for CEFR A1.
Requirements
- Words should commonly appear in beginner English textbooks.
- Frequently used in everyday conversation.
- Easy for beginner learners.
Avoid
- technical terminology
- academic vocabulary
- scientific vocabulary
- idioms
- figurative language
- low-frequency words
- obscure synonyms
- words normally taught above A1`,
  A2: `Vocabulary Level: A2
Avoid - highly technical vocabulary - scientific terminology - advanced academic words - low-frequency words - C1/C2 expressions`,
  B1: `Vocabulary Level: B1
Avoid
- specialist terminology
- highly academic vocabulary
- obscure literary words
- very low-frequency vocabulary`,
  B2: `Vocabulary Level: B2
Avoid
- niche technical terminology
- highly specialized scientific terms
- archaic expressions`,
  C1: `Vocabulary Level: C1
Avoid - obsolete vocabulary - archaic words - domain-specific jargon unless it naturally belongs to the topic`,
  C2: `Vocabulary Level: C2
Avoid
- obsolete words
- historical expressions
- extremely specialized professional jargon
- words that native speakers rarely use outside expert contexts`,
  MIXED: `Vocabulary Level: Mixed.
Span naturally across CEFR levels in teaching order, starting with the most essential/basic words first and
gradually introducing more advanced ones - the way a textbook unit builds up vocabulary.
Label each word with its own accurate CEFR level (do not label everything the same level).
Avoid words that are only technically related but that a teacher would never actually teach for this topic.`,
};

const STYLE_GUIDANCE: Record<string, string> = {
  TEXTBOOK: "Vocabulary Style: Textbook. Neutral, standard English-course style - the same words you'd find in Cambridge, Oxford, Longman, or English File course books.",
  CONVERSATION: "Vocabulary Style: Conversation. Favor words and phrases used in everyday spoken conversation between friends/family - natural, informal, high-frequency spoken English.",
  TRAVEL: "Vocabulary Style: Travel. Favor vocabulary useful for travelers - airports, hotels, directions, ordering food, asking for help - practical survival English.",
  BUSINESS: "Vocabulary Style: Business. Favor workplace vocabulary - meetings, emails, negotiations, presentations - professional register.",
  ACADEMIC: "Vocabulary Style: Academic. Favor vocabulary used in essays, lectures, and academic writing - formal register, precise terminology appropriate to the CEFR level.",
  IELTS: "Vocabulary Style: IELTS. Favor vocabulary commonly tested in IELTS Speaking/Writing for this topic - the kind of topic-specific vocabulary that raises a Lexical Resource band score.",
  TOEIC: "Vocabulary Style: TOEIC. Favor vocabulary common in TOEIC business/office contexts - workplace communication, listening/reading passages.",
  KIDS: "Vocabulary Style: Kids. Favor simple, concrete, child-friendly vocabulary suitable for young learners - avoid abstract concepts.",
  RANDOM: "Vocabulary Style: Random. Freely mix registers and contexts (spoken, written, formal, informal) for varied, well-rounded coverage of the topic.",
};

const SCOPE_GUIDANCE: Record<string, string> = {
  BASIC: "Vocabulary Scope: Basic. Only the most essential core nouns/adjectives/verbs for this topic - the bare minimum a beginner must know.",
  STANDARD: "Vocabulary Scope: Standard. Core nouns, adjectives, verbs, plus a few common phrases and collocations - a typical single-lesson vocabulary set.",
  COMPLETE: "Vocabulary Scope: Complete. Broader coverage - core words, common phrases, collocations, and related word forms (e.g. noun/adjective/verb pairs) - enough for a full unit of study.",
  NATIVE: "Vocabulary Scope: Native. Also include natural native-like expressions, idiomatic collocations, and phrasal verbs where appropriate for the CEFR level (still respect the CEFR Avoid list above - do not include idioms for A1/A2).",
};

// User prompt - mirrors the spec's structure: Topic -> Requirements -> per-level constraint block.
function buildUserPrompt(
  topic: string,
  sourceLangName: string,
  targetLangNames: string[],
  cefrLevel: string,
  style: string,
  scope: string,
  count: number
) {
  return `Topic: ${topic}
Create a CEFR vocabulary set.

Requirements
1. Start from the most important word.
2. Expand naturally like a teacher.
3. Include
- Core nouns
- Adjectives
- Verbs
- Common phrases
- Common collocations
4. Every vocabulary must include
Word
IPA
Part of speech
CEFR
meaning (a natural translation into: ${targetLangNames.join(", ")}), plus one short example sentence in ${sourceLangName}
If uncertain, choose the easier word.

${CEFR_GUIDANCE[cefrLevel]}

${STYLE_GUIDANCE[style]}

${SCOPE_GUIDANCE[scope]}

Generate exactly ${count} vocabulary items, in ${sourceLangName}, in teaching order. Do not include duplicate headwords.`;
}

function buildResponseSchema(targetLangs: string[]) {
  const translationProps: Record<string, any> = {};
  for (const lang of targetLangs) translationProps[lang] = { type: Type.STRING };
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        headword: { type: Type.STRING },
        ipa: { type: Type.STRING },
        type: { type: Type.STRING, enum: WORD_TYPES },
        level: { type: Type.STRING, enum: LEVELS },
        example: { type: Type.STRING },
        translations: { type: Type.OBJECT, properties: translationProps, required: targetLangs },
      },
      required: ["headword", "type", "level", "translations"],
    },
  };
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
        temperature: 0.4,
      },
    })
  );

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned an empty response");
  return JSON.parse(raw);
}

/**
 * Optional post-generation step: cross-check/correct the IPA Gemini produced against
 * dictionaryapi.dev - the only real-world source of truth we have for pronunciation.
 * English headwords only (the free dictionary API doesn't cover other languages).
 * Best-effort: a lookup miss or network error just keeps Gemini's original IPA.
 */
async function verifyIpaWithDictionary(sourceLang: string, words: GeneratedWord[]): Promise<GeneratedWord[]> {
  if (sourceLang !== "en") return words;
  return Promise.all(
    words.map(async (w) => {
      try {
        const dict = await freeDictionaryLookup(w.headword);
        return dict.ipa ? { ...w, ipa: dict.ipa } : w;
      } catch {
        return w;
      }
    })
  );
}

/**
 * POST /api/ai/generate-set { topic, sourceLang, targetLangs, cefrLevel, style, scope, count }
 * Generates a themed, teacher-curated vocabulary set (e.g. topic="weather" -> N related words)
 * for the user to review, edit, and save into a new or existing Collection.
 * Gemini 2.5 Flash does all the generation; dictionaryapi.dev only verifies IPA afterwards
 * for English source words. No free/offline generation fallback - see header comment above.
 */
router.post("/generate-set", async (req, res) => {
  // Everything - including request validation - lives inside this try/catch.
  // Express 4 does NOT forward rejected promises from async handlers to the
  // error middleware automatically, so a zod validation error thrown outside
  // a try/catch here would leave the request hanging with no response at all
  // instead of a clean JSON error. Keeping it all in one try/catch avoids that.
  try {
    const { topic, sourceLang, targetLangs, cefrLevel, style, scope, count } = generateSetInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      return res.json({
        source: "offline",
        words: [],
        note:
          "ฟีเจอร์นี้ต้องใช้ Gemini API ในการสร้างชุดคำศัพท์ทั้งหมด (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) " +
          "ขอคีย์ฟรีได้ที่ aistudio.google.com/apikey แล้ววางใน apps/server/.env จากนั้นรีสตาร์ทเซิร์ฟเวอร์และลองใหม่อีกครั้ง",
      });
    }

    const sourceLangName = LANG_NAMES[sourceLang] ?? sourceLang;
    const targetLangNames = targetLangs.map((l) => LANG_NAMES[l] ?? l);

    const userPrompt = buildUserPrompt(topic, sourceLangName, targetLangNames, cefrLevel, style, scope, count);
    const schema = buildResponseSchema(targetLangs);
    const parsed = await callGemini(SYSTEM_PROMPT, userPrompt, schema, geminiKey);

    let words: GeneratedWord[] = (Array.isArray(parsed) ? parsed : [])
      .filter((w: any) => w?.headword?.trim())
      .slice(0, count)
      .map((w: any) => ({
        headword: String(w.headword).trim(),
        ipa: w.ipa ?? null,
        type: WORD_TYPES.includes(w.type) ? w.type : "OTHER",
        level: LEVELS.includes(w.level) ? w.level : "A1",
        example: w.example ?? null,
        translations: w.translations ?? Object.fromEntries(targetLangs.map((l: string) => [l, ""])),
      }));

    if (!words.length) {
      throw new Error("Gemini returned no usable words");
    }

    // Optional step: verify/correct IPA against dictionaryapi.dev (English only).
    words = await verifyIpaWithDictionary(sourceLang, words);

    return res.json({
      source: "ai",
      words,
      note: `สร้างด้วย Gemini 2.5 Flash · ระดับ ${cefrLevel} · รูปแบบ ${style} · ขอบเขต ${scope}`,
    });
  } catch (err: any) {
    // Log the REAL cause to the server terminal - the message 