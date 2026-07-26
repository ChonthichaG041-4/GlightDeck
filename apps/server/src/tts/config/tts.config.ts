// ============================================================================
// Single source of truth for the Listening TTS system. Everything that varies
// by language/accent/voice lives HERE and nowhere else - providers, the
// AudioService orchestrator, and the frontend all read from (a JSON view of)
// this file rather than hardcoding voice IDs anywhere else.
//
// Providers:
//   - English               -> Kokoro TTS (self-hosted, runs in-process via
//                               kokoro-js, no network call, no API key)
//   - Every other language  -> Microsoft Edge Neural TTS (free, unofficial,
//                               via msedge-tts - no API key either)
// No paid TTS provider (OpenAI/ElevenLabs/Google Cloud/Azure Speech) is used
// anywhere in this file or the providers it configures.
//
// Kokoro's one-time ~80-300MB model download on first use used to make the
// very first "play" click in a fresh dev session look frozen. Two things now
// paper over that instead of dropping Kokoro's (clearer, self-hosted, $0
// marginal cost) voice entirely: index.ts kicks off the model load in the
// background as soon as the server boots (see warmUpKokoro()), and every
// article-creation/edit path in reading.ts pre-synthesizes + caches the
// default-voice audio right when the article is saved (see AudioService's
// pregenerateDefaultAudio()) - so by the time a real user opens Listening,
// both the model AND that article's audio are very likely already warm.
// ============================================================================

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

export type Accent = "AMERICAN" | "BRITISH";
export type VoiceGender = "FEMALE" | "MALE";
export type TTSProviderName = "kokoro" | "edge";

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const DEFAULT_ACCENT: Accent = "AMERICAN";
export const DEFAULT_GENDER: VoiceGender = "FEMALE";

// Only English uses accent+gender; every other language is a single fixed
// Edge Neural voice per the spec's "Recommended voices" table.
export interface KokoroLanguageConfig {
  provider: "kokoro";
  /** accent -> gender -> raw Kokoro voice id. Never sent to the client. */
  voices: Record<Accent, Record<VoiceGender, string>>;
  /** Extra named voices available for the same accent/gender slot (not wired
   *  into the primary Accent/Gender picker yet, kept here so listVoices() and
   *  a future "alternate voice" control can use them without touching the
   *  provider or AudioService). e.g. "American Female 2". */
  alternates?: { id: string; label: string; accent: Accent; gender: VoiceGender }[];
}

export interface EdgeLanguageConfig {
  provider: "edge";
  /** Raw Edge Neural voice id, e.g. "th-TH-PremwadeeNeural". Never sent to the client. */
  voice: string;
}

export type LanguageVoiceConfig = KokoroLanguageConfig | EdgeLanguageConfig;

export const TTS_CONFIG: Record<SupportedLanguage, LanguageVoiceConfig> = {
  en: {
    provider: "kokoro",
    voices: {
      AMERICAN: { FEMALE: "af_bella", MALE: "am_michael" },
      BRITISH: { FEMALE: "bf_emma", MALE: "bm_george" },
    },
    alternates: [{ id: "af_sarah", label: "American Female 2", accent: "AMERICAN", gender: "FEMALE" }],
  },
  th: { provider: "edge", voice: "th-TH-PremwadeeNeural" },
  ja: { provider: "edge", voice: "ja-JP-NanamiNeural" },
  ko: { provider: "edge", voice: "ko-KR-SunHiNeural" },
  zh: { provider: "edge", voice: "zh-CN-XiaoxiaoNeural" },
  vi: { provider: "edge", voice: "vi-VN-HoaiMyNeural" },
  fr: { provider: "edge", voice: "fr-FR-DeniseNeural" },
  de: { provider: "edge", voice: "de-DE-KatjaNeural" },
  es: { provider: "edge", voice: "es-ES-ElviraNeural" },
  id: { provider: "edge", voice: "id-ID-GadisNeural" },
};

export const ALLOWED_SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2] as const;
export type TTSSpeed = (typeof ALLOWED_SPEEDS)[number];
export const DEFAULT_SPEED: TTSSpeed = 1.0;

export const OUTPUT_FORMAT = "mp3" as const;

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

export function isValidSpeed(value: unknown): value is TTSSpeed {
  return typeof value === "number" && (ALLOWED_SPEEDS as readonly number[]).includes(value);
}

export function nearestAllowedSpeed(value: number): TTSSpeed {
  return ALLOWED_SPEEDS.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), DEFAULT_SPEED);
}

/**
 * Resolve a (language, accent?, gender?) tuple to a concrete provider + raw
 * voice id. This is the ONLY place that translates our app-level concepts
 * (language/accent/gender) into a provider-native voice string - providers
 * themselves never see accent/gender, only the resolved voice id.
 *
 * Backward compatibility: a missing/unknown language falls back to English;
 * a missing accent defaults to American; the provider is ALWAYS derived from
 * language here, never read from stored data, so old saved exercises (which
 * predate this system and have no provider/accent at all) resolve correctly
 * with no migration needed.
 */
export function resolveVoice(params: { language?: string | null; accent?: string | null; gender?: string | null }): {
  provider: TTSProviderName;
  voice: string;
  language: SupportedLanguage;
  accent: Accent | null;
  gender: VoiceGender | null;
} {
  const language = isSupportedLanguage(params.language) ? params.language : DEFAULT_LANGUAGE;
  const config = TTS_CONFIG[language];

  if (config.provider === "edge") {
    return { provider: "edge", voice: config.voice, language, accent: null, gender: null };
  }

  const accent: Accent = params.accent === "BRITISH" ? "BRITISH" : DEFAULT_ACCENT;
  const gender: VoiceGender = params.gender === "MALE" ? "MALE" : DEFAULT_GENDER;
  return { provider: "kokoro", voice: config.voices[accent][gender], language, accent, gender };
}

/** Human-facing voice list for admin/debug use - deliberately excludes raw provider voice ids from anything shipped to the end-user UI. */
export function listConfiguredVoices() {
  return SUPPORTED_LANGUAGES.map((language) => {
    const config = TTS_CONFIG[language];
    return {
      language,
      label: LANGUAGE_LABELS[language],
      provider: config.provider,
      hasAccent: config.provider === "kokoro",
    };
  });
}
