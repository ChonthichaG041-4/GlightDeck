/** Thin wrapper around the Web Speech API for word/sentence pronunciation. */
export function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export type Accent = "AMERICAN" | "BRITISH" | "AUSTRALIAN";
export type VoiceGender = "FEMALE" | "MALE";

const ACCENT_LANG: Record<Accent, string> = {
  AMERICAN: "en-US",
  BRITISH: "en-GB",
  AUSTRALIAN: "en-AU",
};

const SPEED_RATE: Record<"SLOW" | "NORMAL" | "FAST", number> = {
  SLOW: 0.75,
  NORMAL: 1.0,
  FAST: 1.25,
};

export function speedToRate(speed: "SLOW" | "NORMAL" | "FAST"): number {
  return SPEED_RATE[speed];
}

const FEMALE_HINTS = ["female", "samantha", "victoria", "zira", "susan", "karen", "tessa", "moira", "fiona", "kate", "serena", "aria"];
const MALE_HINTS = ["male", "daniel", "alex", "fred", "tom", "david", "james", "oliver", "george", "guy", "ryan"];

/** Best-effort voice pick for the requested accent/gender - falls back gracefully since browser voice lists vary a lot. */
export function pickVoice(accent: Accent, gender: VoiceGender): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const lang = ACCENT_LANG[accent];
  const langBase = lang.split("-")[0];
  const sameAccent = voices.filter((v) => v.lang === lang);
  const sameLangFamily = voices.filter((v) => v.lang.startsWith(langBase));
  const pool = sameAccent.length ? sameAccent : sameLangFamily.length ? sameLangFamily : voices;

  const hints = gender === "FEMALE" ? FEMALE_HINTS : MALE_HINTS;
  const genderMatch = pool.find((v) => hints.some((h) => v.name.toLowerCase().includes(h)));
  return genderMatch ?? pool[0] ?? null;
}

/**
 * Speak a (possibly long) passage honoring accent, gender, and speaking rate.
 * Returns the SpeechSynthesisUtterance so the caller can attach onstart/onend/onboundary handlers.
 */
export function speakPassage(
  text: string,
  opts: { accent: Accent; gender: VoiceGender; rate: number }
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = ACCENT_LANG[opts.accent];
  utterance.rate = opts.rate;
  const voice = pickVoice(opts.accent, opts.gender);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function pauseSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.pause();
}

export function resumeSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.resume();
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
