import { getProvider } from "../providers/ProviderRegistry";
import { resolveVoice, DEFAULT_SPEED, nearestAllowedSpeed, type TTSSpeed } from "../config/tts.config";
import { splitIntoChunks } from "./textPreprocess";
import { cacheKeyFor, hasCached, saveToCache, publicUrlFor } from "./AudioCache";

// ============================================================================
// The single entry point every route calls. Controllers/routes never touch a
// provider, a voice id, or the cache directly - they call AudioService.generate()
// with app-level params (text, language, accent, gender, speed) and get back
// a URL. This is what makes providers swappable without touching route code.
// ============================================================================

export interface GenerateAudioRequest {
  text: string;
  /** ISO-ish language code, e.g. "en", "th". Missing/unrecognized -> falls back to English (see resolveVoice). */
  language?: string | null;
  /** English only - ignored for every other language. Missing -> American. */
  accent?: string | null;
  /** English only - ignored for every other language. Missing -> Female. */
  gender?: string | null;
  /** One of ALLOWED_SPEEDS (0.8-1.2). Missing/invalid -> nearest allowed value, default 1.0. */
  speed?: number | null;
}

export interface GenerateAudioResult {
  url: string;
  cached: boolean;
  provider: "kokoro" | "edge";
  language: string;
  speed: TTSSpeed;
}

export async function generate(request: GenerateAudioRequest): Promise<GenerateAudioResult> {
  const text = (request.text ?? "").trim();
  if (!text) throw new Error("No text provided for speech generation");

  const speed: TTSSpeed = request.speed != null && Number.isFinite(request.speed)
    ? nearestAllowedSpeed(request.speed)
    : DEFAULT_SPEED;

  const { provider: providerName, voice, language } = resolveVoice({
    language: request.language,
    accent: request.accent,
    gender: request.gender,
  });

  // Cache key is over the FULL request (whole passage), not per-chunk - one
  // cache entry per (provider, voice, speed, text) exactly as specced, and
  // it's simpler: a cache hit skips chunking/synthesis entirely.
  const chunks = splitIntoChunks(text);
  const normalizedFullText = chunks.join(" ");
  const key = cacheKeyFor({ provider: providerName, voice, speed, text: normalizedFullText });

  if (await hasCached(key)) {
    return { url: publicUrlFor(key), cached: true, provider: providerName, language, speed };
  }

  const provider = getProvider(providerName);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const audio = await provider.generateSpeech({ text: chunk, voice, speed });
    buffers.push(audio.buffer);
  }
  const combined = Buffer.concat(buffers);
  await saveToCache(key, combined);

  return { url: publicUrlFor(key), cached: false, provider: providerName, language, speed };
}

/**
 * Fire-and-forget: pre-synthesizes and caches the DEFAULT-voice audio
 * (English, American accent, Female voice, 1.0x speed - see tts.config.ts's
 * DEFAULT_* constants) for a freshly created/updated article's full content,
 * so opening it in ListeningWorkspace later hits an already-warm cache
 * instead of paying for synthesis (and, for Kokoro, a possible cold model
 * load) at practice time. Called from every article-creation/content-edit
 * route in reading.ts - never awaited there, so it can never slow down or
 * fail a save.
 *
 * Assumes English: Article has no stored "language" column, and English is
 * this app's overwhelmingly common content language. A non-default accent/
 * gender pick, a different playback speed, or genuinely non-English content
 * still falls back to synthesizing on first play exactly as before - this is
 * a head start for the common case, not a guarantee.
 */
export function pregenerateDefaultAudio(text: string | null | undefined): void {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  generate({ text: trimmed }).catch((err) => {
    console.error(
      "[TTS] Background audio pre-generation failed (non-fatal - will synthesize on first play instead):",
      err?.message ?? err
    );
  });
}
