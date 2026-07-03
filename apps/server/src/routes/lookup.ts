import { Router } from "express";
import { z } from "zod";

const router = Router();

const LANG_NAMES: Record<string, string> = {
  en: "English", th: "Thai", ja: "Japanese", ko: "Korean", zh: "Chinese",
  vi: "Vietnamese", fr: "French", de: "German", es: "Spanish", id: "Indonesian",
};

const inputSchema = z.object({
  headword: z.string().min(1),
  sourceLang: z.string().default("en"),
  targetLangs: z.array(z.string()).min(1).default(["th"]),
});

const WORD_TYPES = [
  "NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG",
  "PHRASE", "PREPOSITION", "CONJUNCTION", "PRONOUN", "OTHER",
];

const POS_MAP: Record<string, string> = {
  noun: "NOUN", verb: "VERB", adjective: "ADJECTIVE", adverb: "ADVERB",
  preposition: "PREPOSITION", conjunction: "CONJUNCTION", pronoun: "PRONOUN",
  interjection: "OTHER", exclamation: "OTHER", article: "OTHER", determiner: "OTHER",
};

interface LookupResult {
  source: "ai" | "free" | "offline";
  ipa: string | null;
  type: string;
  level: string | null;
  example: string | null;
  translations: Record<string, string>;
}

/** Free, no-key dictionary lookup (English headwords only) - https://dictionaryapi.dev */
async function freeDictionaryLookup(headword: string): Promise<{ ipa: string | null; type: string | null; example: string | null }> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(headword)}`);
    if (!res.ok) return { ipa: null, type: null, example: null };
    const data: any = await res.json();
    const entry = data?.[0];
    const ipa = entry?.phonetic ?? entry?.phonetics?.find((p: any) => p.text)?.text ?? null;
    const meaning = entry?.meanings?.[0];
    const type = meaning?.partOfSpeech ? POS_MAP[meaning.partOfSpeech.toLowerCase()] ?? "OTHER" : null;
    const example = meaning?.definitions?.find((d: any) => d.example)?.example ?? null;
    return { ipa, type, example };
  } catch {
    return { ipa: null, type: null, example: null };
  }
}

/** Free, no-key translation - https://mymemory.translated.net (rate-limited, best-effort). */
async function freeTranslate(headword: string, sourceLang: string, targetLang: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(headword)}&langpair=${sourceLang}|${targetLang}`
    );
    if (!res.ok) return "";
    const data: any = await res.json();
    const text = data?.responseData?.translatedText ?? "";
    return /no query|invalid|rate limit/i.test(text) ? "" : text;
  } catch {
    return "";
  }
}

async function freeLookup(headword: string, sourceLang: string, targetLangs: string[]): Promise<LookupResult> {
  const [dict, translationEntries] = await Promise.all([
    sourceLang === "en" ? freeDictionaryLookup(headword) : Promise.resolve({ ipa: null, type: null, example: null }),
    Promise.all(targetLangs.map(async (lang) => [lang, await freeTranslate(headword, sourceLang, lang)] as const)),
  ]);

  return {
    source: "free",
    ipa: dict.ipa,
    type: dict.type ?? "OTHER",
    level: null,
    example: dict.example,
    translations: Object.fromEntries(translationEntries),
  };
}

/**
 * POST /api/words/lookup { headword, sourceLang, targetLangs }
 * Priority: Anthropic API (if ANTHROPIC_API_KEY is set) -> free no-key APIs
 * (dictionaryapi.dev + MyMemory) -> empty "offline" stub as last resort.
 */
router.post("/", async (req, res) => {
  const { headword, sourceLang, targetLangs } = inputSchema.parse(req.body);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      const sourceLangName = LANG_NAMES[sourceLang] ?? sourceLang;

      const prompt = `You are a dictionary + translator. The word/phrase "${headword}" is in ${sourceLangName}.
Reply strictly as minified JSON (no markdown, no commentary) with this exact shape:
{"ipa":"<IPA pronunciation or null>","type":"<one of ${WORD_TYPES.join("|")}>","level":"<CEFR level A1|A2|B1|B2|C1|C2>","example":"<one short example sentence in ${sourceLangName}>","translations":{${targetLangs.map((l) => `"${l}":"<translation into ${LANG_NAMES[l] ?? l}>"`).join(",")}}}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
      const data: any = await response.json();
      const raw = data?.content?.[0]?.text ?? "{}";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

      return res.json({
        source: "ai",
        ipa: parsed.ipa ?? null,
        type: WORD_TYPES.includes(parsed.type) ? parsed.type : "OTHER",
        level: ["A1", "A2", "B1", "B2", "C1", "C2"].includes(parsed.level) ? parsed.level : "A1",
        example: parsed.example ?? null,
        translations: parsed.translations ?? Object.fromEntries(targetLangs.map((l) => [l, ""])),
      });
    } catch (err) {
      console.error("AI lookup failed, falling back to free APIs", err);
    }
  }

  try {
    const result = await freeLookup(headword, sourceLang, targetLangs);
    return res.json(result);
  } catch (err) {
    console.error("Free lookup failed", err);
    return res.json({
      source: "offline",
      ipa: null,
      type: "OTHER",
      level: null,
      example: null,
      translations: Object.fromEntries(targetLangs.map((l) => [l, ""])),
    });
  }
});

export default router;
