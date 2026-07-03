// Shared, no-key ("free") lookup/translation/related-words helpers.
// Used by both the single-word auto-suggest endpoint (routes/lookup.ts) and the
// AI vocabulary-set generator (routes/ai.ts) as a fallback when ANTHROPIC_API_KEY isn't set.

export const LANG_NAMES: Record<string, string> = {
  en: "English", th: "Thai", ja: "Japanese", ko: "Korean", zh: "Chinese",
  vi: "Vietnamese", fr: "French", de: "German", es: "Spanish", id: "Indonesian",
};

export const WORD_TYPES = [
  "NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG",
  "PHRASE", "PREPOSITION", "CONJUNCTION", "PRONOUN", "OTHER",
];

const POS_MAP: Record<string, string> = {
  noun: "NOUN", verb: "VERB", adjective: "ADJECTIVE", adverb: "ADVERB",
  preposition: "PREPOSITION", conjunction: "CONJUNCTION", pronoun: "PRONOUN",
  interjection: "OTHER", exclamation: "OTHER", article: "OTHER", determiner: "OTHER",
};

/** Free, no-key dictionary lookup (English headwords only) - https://dictionaryapi.dev */
export async function freeDictionaryLookup(headword: string): Promise<{ ipa: string | null; type: string | null; example: string | null }> {
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
export async function freeTranslate(headword: string, sourceLang: string, targetLang: string): Promise<string> {
  if (sourceLang === targetLang) return headword;
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

/** Free, no-key "words related to a topic" - https://www.datamuse.com/api (means-like query). English only. */
export async function freeRelatedWords(englishTopic: string, max = 18): Promise<string[]> {
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(englishTopic)}&max=${max}`);
    if (!res.ok) return [];
    const data: any = await res.json();
    return Array.isArray(data) ? data.map((d: any) => d.word).filter(Boolean) : [];
  } catch {
    return [];
  }
}
