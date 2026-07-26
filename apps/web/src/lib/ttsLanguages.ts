// Frontend mirror of apps/server/src/tts/config/tts.config.ts's language/accent/
// speed constants - kept as plain display data (labels, allowed values) since
// the actual provider/voice-id resolution only ever happens server-side (the
// backend is the single source of truth; this file must be kept in sync with
// it by hand whenever a language is added/removed there).

export type SupportedLanguage = "en" | "th" | "ja" | "ko" | "zh" | "vi" | "fr" | "de" | "es" | "id";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "th", "ja", "ko", "zh", "vi", "fr", "de", "es", "id"];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  th: "Thai",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  vi: "Vietnamese",
  fr: "French",
  de: "German",
  es: "Spanish",
  id: "Indonesian",
};

/** Only English currently has an Accent/Voice choice (Kokoro) - every other language uses one fixed Edge Neural voice. */
export function languageHasAccentChoice(language: SupportedLanguage): boolean {
  return language === "en";
}

export type Accent = "AMERICAN" | "BRITISH";
export type VoiceGender = "FEMALE" | "MALE";

export const ALLOWED_SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2] as const;
export type TTSSpeed = (typeof ALLOWED_SPEEDS)[number];
export const DEFAULT_SPEED: TTSSpeed = 1.0;
