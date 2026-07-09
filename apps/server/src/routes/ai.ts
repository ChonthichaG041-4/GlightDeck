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
    // Log the REAL cause to the server terminal - the message sent to the client stays
    // generic/Thai, but whoever is running the server can see exactly what broke.
    console.error("Gemini generate-set failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({
        source: "offline",
        words: [],
        note: "ข้อมูลที่ส่งมาไม่ถูกต้อง (validation error) - ดู log ฝั่งเซิร์ฟเวอร์สำหรับรายละเอียด",
      });
    }

    return res.json({
      source: "offline",
      words: [],
      note: friendlyGeminiError(err, "สร้างชุดคำศัพท์ด้วย Gemini"),
    });
  }
});

// ---------------------------------------------------------------------------
// Reading Workspace: full dictionary lookup for the double-click popup -
// POST /api/ai/word-detail
//
// Unlike /words/lookup (which only returns enough to prefill the Add Word
// form), this returns the richer, read-only dictionary content the Reading
// Workspace's popup displays: multiple meanings, an example with translation,
// synonyms/antonyms, word family, CEFR level, audio pronunciation, and a 1-5
// frequency rating.
//
// Three sources, layered so real dictionary data always wins over AI:
//   1. DictionaryEntry (Kaikki.org's Wiktionary extract, imported offline via
//      scripts/import-kaikki.ts) - real IPA, real audio, real synonyms/
//      antonyms, and genuine Thai translations straight from Wiktionary.
//   2. Free Dictionary API (api.dictionaryapi.dev, live, no key) - fills in
//      ipa/audio/definitions/synonyms/antonyms/example when a word isn't in
//      the (optional, self-hosted) Kaikki table.
//   3. Gemini - fills in what neither free source has: CEFR level, frequency
//      rating, word family, an example translation, and (only if neither
//      source above had any) the Thai meaning itself. If GEMINI_API_KEY isn't
//      set, whatever Kaikki/Free Dictionary already found is still returned,
//      just without those AI-only fields.
// ---------------------------------------------------------------------------

const wordDetailInput = z.object({
  word: z.string().min(1),
  sourceLang: z.string().default("en"),
  targetLang: z.string().default("th"),
});

interface KaikkiSenseRow {
  gloss: string;
  examples: string[];
  tags: string[];
}

async function lookupKaikki(word: string) {
  const rows = await prisma.dictionaryEntry.findMany({ where: { word: word.toLowerCase() } });
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => (b.senses as unknown as KaikkiSenseRow[]).length - (a.senses as unknown as KaikkiSenseRow[]).length);
  const primary = sorted[0];
  const primarySenses = primary.senses as unknown as KaikkiSenseRow[];

  const thaiMeanings = new Set<string>();
  for (const r of rows) {
    for (const t of r.translations as unknown as { lang: string; word: string }[]) {
      if (t.lang === "th" && t.word) thaiMeanings.add(t.word);
    }
  }

  let exampleText: string | null = null;
  for (const s of primarySenses) {
    if (s.examples.length) {
      exampleText = s.examples[0];
      break;
    }
  }

  return {
    ipa: primary.ipa,
    audioUrl: primary.audioUrl,
    partOfSpeech: KAIKKI_POS_MAP[primary.pos] ?? "OTHER",
    glosses: primarySenses.map((s) => s.gloss).filter(Boolean).slice(0, 3),
    example: exampleText,
    synonyms: primary.synonyms.slice(0, 4),
    antonyms: primary.antonyms.slice(0, 4),
    thaiMeanings: Array.from(thaiMeanings).slice(0, 4),
  };
}

router.post("/word-detail", async (req, res) => {
  try {
    const { word, sourceLang, targetLang } = wordDetailInput.parse(req.body);
    const sourceLangName = LANG_NAMES[sourceLang] ?? sourceLang;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    // Kaikki is an English-only (Wiktionary) dataset - only consult it for
    // English lookups. Same story for the Free Dictionary API below.
    const kaikki = sourceLang === "en" ? await lookupKaikki(word) : null;
    const free = !kaikki && sourceLang === "en" ? await freeDictionaryFullLookup(word) : null;
    const freeBestMeaning = free?.meanings?.[0];

    const sources: string[] = [];
    if (kaikki) sources.push("kaikki");
    if (free) sources.push("free-dictionary");

    let ipa: string | null = kaikki?.ipa ?? free?.ipa ?? null;
    let audioUrl: string | null = kaikki?.audioUrl ?? free?.audioUrl ?? null;
    let partOfSpeech: string | null = kaikki?.partOfSpeech ?? (freeBestMeaning ? mapFreePos(freeBestMeaning.partOfSpeech) : null);
    let englishGlosses: string[] = kaikki?.glosses?.length ? kaikki.glosses : (freeBestMeaning?.definitions.slice(0, 3) ?? []);
    let exampleText: string | null = kaikki?.example ?? freeBestMeaning?.example ?? null;
    let synonyms: string[] = kaikki?.synonyms?.length ? kaikki.synonyms : (free?.meanings.flatMap((m) => m.synonyms).slice(0, 4) ?? []);
    let antonyms: string[] = kaikki?.antonyms?.length ? kaikki.antonyms : (free?.meanings.flatMap((m) => m.antonyms).slice(0, 4) ?? []);
    let thaiMeanings: string[] = kaikki?.thaiMeanings ?? [];

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // Nothing at all found anywhere, and no Gemini to fall back on - this is
    // the only case where we tell the user the lookup failed outright.
    if (!kaikki && !free && !geminiKey) {
      return res.json({
        source: "offline",
        result: null,
        note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)",
      });
    }

    let level = "A1";
    let frequency = 3;
    let wordFamily: string[] = [];
    let exampleTranslation = "";
    let note: string | undefined;

    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const known =
          englishGlosses.length || exampleText
            ? `A dictionary already gives this information, which you should stay consistent with rather than contradict:\n` +
              (partOfSpeech ? `- part of speech: ${partOfSpeech}\n` : "") +
              (englishGlosses.length ? `- senses: ${englishGlosses.join(" / ")}\n` : "") +
              (exampleText ? `- example sentence: "${exampleText}"\n` : "")
            : "";

        const prompt = `Look up the ${sourceLangName} word or short phrase "${word}" for a ${targetLangName}-speaking English learner using a Reading Workspace's dictionary popup.
${known}
Reply with:
- ipa: IPA pronunciation (or null if not applicable, e.g. for a phrase). ${ipa ? `(already known: ${ipa} - repeat it)` : ""}
- partOfSpeech: one of ${WORD_TYPES.join(", ")}.
- level: CEFR level (A1, A2, B1, B2, C1, or C2) for how advanced this word is.
- frequency: how common this word is in everyday English, 1 (rare) to 5 (extremely common).
- meanings: ${thaiMeanings.length ? `translate these exact senses into ${targetLangName}, same order: ${englishGlosses.join(" / ")}` : `1-3 short ${targetLangName} translations/senses of the word, most common first`}.
- example: ${exampleText ? `translate this exact sentence into ${targetLangName}: "${exampleText}"` : `one natural example sentence in ${sourceLangName} using the word, plus its ${targetLangName} translation`}.
- synonyms: up to 4 English synonyms (empty array if none fit naturally).
- antonyms: up to 4 English antonyms (empty array if none fit naturally).
- wordFamily: other related word forms in the same family (e.g. overwhelm, overwhelmed, overwhelmingly) - empty array if none.`;

        const response = await withGeminiRetry(() =>
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              systemInstruction: "You are a precise bilingual dictionary for English learners.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  ipa: { type: Type.STRING, nullable: true },
                  partOfSpeech: { type: Type.STRING, enum: WORD_TYPES },
                  level: { type: Type.STRING, enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
                  frequency: { type: Type.INTEGER },
                  meanings: { type: Type.ARRAY, items: { type: Type.STRING } },
                  example: {
                    type: Type.OBJECT,
                    properties: { text: { type: Type.STRING }, translation: { type: Type.STRING } },
                    required: ["text", "translation"],
                  },
                  synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                  antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                  wordFamily: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["partOfSpeech", "level", "frequency", "meanings", "example", "synonyms", "antonyms", "wordFamily"],
              },
              temperature: 0.2,
            },
          })
        );

        const raw = response.text;
        if (!raw) throw new Error("Gemini returned an empty response");
        const parsed = JSON.parse(raw);
        sources.push("ai");

        ipa = ipa ?? parsed.ipa ?? null;
        partOfSpeech = partOfSpeech ?? (WORD_TYPES.includes(parsed.partOfSpeech) ? parsed.partOfSpeech : "OTHER");
        level = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(parsed.level) ? parsed.level : "A1";
        frequency = Math.min(5, Math.max(1, Number(parsed.frequency) || 3));
        if (!thaiMeanings.length) thaiMeanings = Array.isArray(parsed.meanings) ? parsed.meanings.filter(Boolean) : [];
        exampleTranslation = parsed.example?.translation ?? "";
        if (!exampleText) exampleText = parsed.example?.text ?? null;
        if (!synonyms.length) synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms.filter(Boolean) : [];
        if (!antonyms.length) antonyms = Array.isArray(parsed.antonyms) ? parsed.antonyms.filter(Boolean) : [];
        wordFamily = Array.isArray(parsed.wordFamily) ? parsed.wordFamily.filter(Boolean) : [];
      } catch (geminiErr: any) {
        console.error("Gemini word-detail gap-fill failed:", geminiErr?.message ?? geminiErr);
        // Kaikki/Free Dictionary data (if any) is still useful on its own -
        // degrade gracefully instead of failing the whole lookup.
        note = friendlyGeminiError(geminiErr, "เติมข้อมูล CEFR/ความถี่/คำแปล");
      }
    } else if (kaikki || free) {
      note = "ยังไม่ได้ตั้งค่า GEMINI_API_KEY - ระดับ CEFR และความถี่เป็นค่าประมาณ และคำแปลไทยอาจไม่ครบ";
    }

    if (!kaikki && !free && !thaiMeanings.length && !englishGlosses.length) {
      // Gemini itself found nothing usable either.
      return res.json({ source: "offline", result: null, note: note ?? "ค้นหาคำนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }

    return res.json({
      source: sources.join("+") || "offline",
      result: {
        word,
        ipa,
        audioUrl,
        partOfSpeech: partOfSpeech ?? "OTHER",
        level,
        frequency,
        meanings: thaiMeanings.length ? thaiMeanings : englishGlosses,
        example: exampleText ? { text: exampleText, translation: exampleTranslation } : null,
        synonyms,
        antonyms,
        wordFamily,
      },
      note,
    });
  } catch (err: any) {
    console.error("word-detail failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", result: null, note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({
      source: "offline",
      result: null,
      note: friendlyGeminiError(err, "ค้นหาคำศัพท์"),
    });
  }
});

function mapFreePos(pos: string): string {
  const map: Record<string, string> = {
    noun: "NOUN", verb: "VERB", adjective: "ADJECTIVE", adverb: "ADVERB",
    preposition: "PREPOSITION", conjunction: "CONJUNCTION", pronoun: "PRONOUN",
  };
  return map[pos?.toLowerCase()] ?? "OTHER";
}

// ---------------------------------------------------------------------------
// Reading Workspace: Grammar knowledge box - POST /api/ai/grammar-notes
//
// For the "Reading + Grammar" test mode: identifies notable grammar points
// actually used in the passage and explains each one, quoting a real example
// straight from the text. Stateless (derives points from the passage itself
// rather than requiring the original grammarFocus selection to be persisted),
// so it works for any passage regardless of how it was created.
// ---------------------------------------------------------------------------

const grammarNotesInput = z.object({
  passage: z.string().min(1),
  targetLang: z.string().default("th"),
});

router.post("/grammar-notes", async (req, res) => {
  try {
    const { passage, targetLang } = grammarNotesInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    if (!geminiKey) {
      return res.json({
        source: "offline",
        points: [],
        note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)",
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Reading passage:\n\n${passage}\n\nIdentify 3-6 notable English grammar points actually used in this passage (e.g. Past Perfect, Passive Voice, Relative Clauses, Conditionals, Phrasal Verbs). For each one:
- title: the grammar point's name (in English, short).
- explanation: explain what it is and how it's used here, in ${targetLangName}, in 1-3 sentences.
- example: quote a short exact sentence or phrase from the passage above that illustrates it.
Only include points that genuinely appear in the passage - do not invent grammar that isn't there.`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an experienced ESL teacher pointing out grammar in a text for a learner.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                example: { type: Type.STRING },
              },
              required: ["title", "explanation", "example"],
            },
          },
          temperature: 0.3,
        },
      })
    );

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const parsed = JSON.parse(raw);

    const points = (Array.isArray(parsed) ? parsed : [])
      .filter((p: any) => p?.title?.trim() && p?.explanation?.trim())
      .map((p: any) => ({
        title: String(p.title).trim(),
        explanation: String(p.explanation).trim(),
        example: String(p.example ?? "").trim(),
      }));

    return res.json({ source: "ai", points });
  } catch (err: any) {
    console.error("Gemini grammar-notes failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", points: [], note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({
      source: "offline",
      points: [],
      note: friendlyGeminiError(err, "วิเคราะห์ไวยากรณ์"),
    });
  }
});

// ---------------------------------------------------------------------------
// Reading Workspace: AI-explain-a-sentence - POST /api/ai/explain-sentence
// ---------------------------------------------------------------------------

const explainSentenceInput = z.object({
  sentence: z.string().min(1),
  passageContext: z.string().optional().default(""),
  targetLang: z.string().default("th"),
});

/**
 * POST /api/ai/explain-sentence { sentence, passageContext, targetLang }
 * Used by the Reading Workspace's "AI Explain" panel (click a sentence while reading).
 * Returns a grammar breakdown, a vocabulary breakdown, a natural translation, and a
 * literal/word-for-word translation - Gemini-only, matching the other AI-generation routes.
 */
router.post("/explain-sentence", async (req, res) => {
  try {
    const { sentence, passageContext, targetLang } = explainSentenceInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    if (!geminiKey) {
      return res.json({
        source: "offline",
        result: null,
        note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)",
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Sentence to explain: "${sentence}"
${passageContext ? `\nContext (the surrounding passage, for disambiguation only - do not explain this, only the sentence above):\n${passageContext}` : ""}

Explain this sentence for a ${targetLangName}-speaking English learner. Reply with:
- grammar: explain the grammar/structure of the sentence, in ${targetLangName}.
- vocabulary: explain any notable words/phrases in the sentence, in ${targetLangName}.
- naturalTranslation: a natural, fluent translation into ${targetLangName}.
- literalTranslation: a literal, word-for-word (or close to it) translation into ${targetLangName}, to help the learner see how the English maps across.`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an experienced ESL teacher explaining sentences to a learner.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              grammar: { type: Type.STRING },
              vocabulary: { type: Type.STRING },
              naturalTranslation: { type: Type.STRING },
              literalTranslation: { type: Type.STRING },
            },
            required: ["grammar", "vocabulary", "naturalTranslation", "literalTranslation"],
          },
          temperature: 0.4,
        },
      })
    );

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const parsed = JSON.parse(raw);

    return res.json({ source: "ai", result: parsed });
  } catch (err: any) {
    console.error("Gemini explain-sentence failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", result: null, note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({
      source: "offline",
      result: null,
      note: friendlyGeminiError(err, "อธิบายประโยค"),
    });
  }
});

// ---------------------------------------------------------------------------
// Create Mode: AI writing assist - POST /api/ai/writing-assist
// ---------------------------------------------------------------------------

const writingAssistInput = z.object({
  paragraph: z.string().min(1),
  instruction: z.enum(["CONTINUE", "IMPROVE", "FIX_GRAMMAR", "SHORTEN", "EXPAND", "SIMPLIFY"]).default("IMPROVE"),
});

const INSTRUCTION_PROMPTS: Record<string, string> = {
  CONTINUE: "Continue writing naturally from where this paragraph leaves off. Return ONLY the new text to append (do not repeat the original paragraph).",
  IMPROVE: "Rewrite this paragraph to be clearer and more natural, keeping the same meaning and roughly the same length. Return ONLY the rewritten paragraph.",
  FIX_GRAMMAR: "Fix any grammar, spelling, or punctuation mistakes in this paragraph, changing wording as little as possible. Return ONLY the corrected paragraph.",
  SHORTEN: "Make this paragraph more concise while keeping the key meaning. Return ONLY the shortened paragraph.",
  EXPAND: "Expand this paragraph with more natural detail/description. Return ONLY the expanded paragraph.",
  SIMPLIFY: "Rewrite this paragraph using simpler vocabulary and shorter, less complex sentence structures (aim for a lower CEFR level) while keeping the same meaning and roughly the same length - this is about reducing difficulty, not length. Return ONLY the simplified paragraph.",
};

/**
 * POST /api/ai/writing-assist { paragraph, instruction }
 * Used by Create Mode's "AI Assist" button while authoring a reading passage.
 */
router.post("/writing-assist", async (req, res) => {
  try {
    const { paragraph, instruction } = writingAssistInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      return res.json({
        source: "offline",
        text: null,
        note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)",
      });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${INSTRUCTION_PROMPTS[instruction]}\n\nParagraph:\n${paragraph}`,
        config: {
          systemInstruction: "You are a skilled writing assistant helping an author draft a reading-practice passage for English learners.",
          temperature: 0.6,
        },
      })
    );

    const text = (response.text ?? "").trim();
    if (!text) throw new Error("Gemini returned an empty response");

    return res.json({ source: "ai", text });
  } catch (err: any) {
    console.error("Gemini writing-assist failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);

    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", text: null, note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({
      source: "offline",
      text: null,
      note: friendlyGeminiError(err, "ช่วยเขียน"),
    });
  }
});

// ---------------------------------------------------------------------------
// Create Mode: whole-passage AI Assistant actions - Generate Vocabulary,
// Generate Questions, Generate Summary, Generate Translation. Each operates on
// the entire composed passage at once (unlike writing-assist above, which is
// per-paragraph), populating the Vocabulary panel / Question Builder /
// Description field / translation respectively.
// ---------------------------------------------------------------------------

const vocabularyDetectInput = z.object({
  passage: z.string().min(1),
  targetLang: z.string().default("th"),
  max: z.number().int().min(1).max(20).default(10),
});

/**
 * POST /api/ai/vocabulary-detect { passage, targetLang, max }
 * Powers both the Vocabulary panel's "Auto Detect" mode and the AI Assistant's
 * "Generate Vocabulary" button: identifies the most notable/difficult words in
 * the passage and gives each a short translation, in a single efficient call
 * (rather than fanning out to the full per-word Kaikki/Free Dictionary/Gemini
 * pipeline used by the Reading Workspace's double-click popup).
 */
router.post("/vocabulary-detect", async (req, res) => {
  try {
    const { passage, targetLang, max } = vocabularyDetectInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    if (!geminiKey) {
      return res.json({ source: "offline", vocabulary: [], note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)" });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Reading passage:\n\n${passage}\n\nIdentify up to ${max} of the most notable/difficult English words or short phrases actually used in this passage - words a learner reading it would likely want defined. For each: headword (exact form as it appears, or its dictionary/base form), meaning (a short ${targetLangName} translation), and ipa (IPA pronunciation, or null if unsure).`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an experienced ESL teacher picking out vocabulary worth teaching from a passage.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                headword: { type: Type.STRING },
                meaning: { type: Type.STRING },
                ipa: { type: Type.STRING, nullable: true },
              },
              required: ["headword", "meaning"],
            },
          },
          temperature: 0.3,
        },
      })
    );

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const parsed = JSON.parse(raw);

    const vocabulary = (Array.isArray(parsed) ? parsed : [])
      .filter((v: any) => v?.headword?.trim() && v?.meaning?.trim())
      .slice(0, max)
      .map((v: any) => ({ headword: String(v.headword).trim(), meaning: String(v.meaning).trim(), ipa: v.ipa ? String(v.ipa).trim() : null }));

    return res.json({ source: "ai", vocabulary });
  } catch (err: any) {
    console.error("Gemini vocabulary-detect failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", vocabulary: [], note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({ source: "offline", vocabulary: [], note: friendlyGeminiError(err, "ตรวจจับคำศัพท์") });
  }
});

const generateQuestionsForPassageInput = z.object({
  passage: z.string().min(1),
  numQuestions: z.number().int().min(1).max(30).default(8),
  targetLang: z.string().default("th"),
});

const PASSAGE_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "SHORT_ANSWER", "ESSAY"];

/**
 * POST /api/ai/generate-questions-for-passage { passage, numQuestions, targetLang }
 * AI Assistant's "Generate Questions" button - populates the Question Builder
 * from whatever passage is currently composed (any Content Source). Matching/
 * Ordering aren't generated here (see reading.ts's CONCRETE_QUESTION_TYPES
 * comment) - those stay manually-authored only.
 */
router.post("/generate-questions-for-passage", async (req, res) => {
  try {
    const { passage, numQuestions, targetLang } = generateQuestionsForPassageInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      return res.json({ source: "offline", questions: [], note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)" });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Reading passage:\n\n${passage}\n\nWrite exactly ${numQuestions} reading-comprehension questions based only on this passage, mixing general comprehension, vocabulary-in-context, and detail questions.
Use only these question types: ${PASSAGE_QUESTION_TYPES.join(", ")}.
- MULTIPLE_CHOICE: exactly 4 options, one correct answer.
- TRUE_FALSE: options must be exactly ["True", "False"].
- FILL_BLANK: options empty; put the missing word/phrase in "answer".
- SHORT_ANSWER: options empty; put a concise model answer in "answer".
- ESSAY: options empty; put a short model answer / grading note in "answer" (free-response, not auto-graded).
Each question needs "type", "skill" (a short label like "Detail" or "Vocabulary in Context"), "prompt", "options", and "answer".`;

    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an experienced ESL teacher writing reading-comprehension questions.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: PASSAGE_QUESTION_TYPES },
                skill: { type: Type.STRING },
                prompt: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answer: { type: Type.STRING },
              },
              required: ["type", "skill", "prompt", "answer"],
            },
          },
          temperature: 0.5,
        },
      })
    );

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const parsed = JSON.parse(raw);

    const questions = (Array.isArray(parsed) ? parsed : [])
      .filter((q: any) => q?.prompt?.trim() && q?.answer?.trim())
      .slice(0, numQuestions)
      .map((q: any) => ({
        type: PASSAGE_QUESTION_TYPES.includes(q.type) ? q.type : "MULTIPLE_CHOICE",
        skill: q.skill ? String(q.skill).trim() : "Detail",
        prompt: String(q.prompt).trim(),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        answer: String(q.answer).trim(),
      }));

    if (!questions.length) throw new Error("Gemini returned no usable questions");
    return res.json({ source: "ai", questions });
  } catch (err: any) {
    console.error("Gemini generate-questions-for-passage failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", questions: [], note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({ source: "offline", questions: [], note: friendlyGeminiError(err, "สร้างคำถาม") });
  }
});

const generateSummaryInput = z.object({
  passage: z.string().min(1),
  targetLang: z.string().default("th"),
});

/** POST /api/ai/generate-summary { passage, targetLang } - AI Assistant's "Generate Summary" button, fills the Description field. */
router.post("/generate-summary", async (req, res) => {
  try {
    const { passage, targetLang } = generateSummaryInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    if (!geminiKey) {
      return res.json({ source: "offline", summary: null, note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)" });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Reading passage:\n\n${passage}\n\nWrite a short (1-2 sentence) summary/blurb of this passage in ${targetLangName}, suitable as a "Description" field shown to readers deciding whether to read it. Return ONLY the summary text.`,
        config: { systemInstruction: "You write concise, appealing descriptions for reading passages.", temperature: 0.5 },
      })
    );

    const summary = (response.text ?? "").trim();
    if (!summary) throw new Error("Gemini returned an empty response");
    return res.json({ source: "ai", summary });
  } catch (err: any) {
    console.error("Gemini generate-summary failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", summary: null, note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({ source: "offline", summary: null, note: friendlyGeminiError(err, "สร้างคำโปรย") });
  }
});

const generateTranslationInput = z.object({
  passage: z.string().min(1),
  targetLang: z.string().default("th"),
});

/** POST /api/ai/generate-translation { passage, targetLang } - AI Assistant's "Generate Translation" button (whole-passage translation, for Test Mode "Reading + Translation"). */
router.post("/generate-translation", async (req, res) => {
  try {
    const { passage, targetLang } = generateTranslationInput.parse(req.body);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const targetLangName = LANG_NAMES[targetLang] ?? targetLang;

    if (!geminiKey) {
      return res.json({ source: "offline", translation: null, note: "ฟีเจอร์นี้ต้องใช้ Gemini API (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์)" });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Translate this entire reading passage into ${targetLangName}, naturally and fluently, preserving paragraph breaks:\n\n${passage}`,
        config: { systemInstruction: "You are a precise, natural literary translator.", temperature: 0.3 },
      })
    );

    const translation = (response.text ?? "").trim();
    if (!translation) throw new Error("Gemini returned an empty response");
    return res.json({ source: "ai", translation });
  } catch (err: any) {
    console.error("Gemini generate-translation failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    if (err?.name === "ZodError") {
      return res.status(400).json({ source: "offline", translation: null, note: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }
    return res.json({ source: "offline", translation: null, note: friendlyGeminiError(err, "แปลบทความ") });
  }
});

export default router;
