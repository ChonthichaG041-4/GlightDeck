import type { TTSProviderName, TTSSpeed } from "../config/tts.config";

// ============================================================================
// Every TTS backend (Kokoro, Edge, and any future one - OpenAI/ElevenLabs/
// Azure/Google would all slot in here too) implements this one interface.
// Providers work in terms of a RESOLVED, provider-native voice string - they
// never see our app-level "accent"/"gender"/"language" concepts. That
// resolution happens once, in config/tts.config.ts's resolveVoice(), so
// adding a provider never requires touching AudioService's or the route's
// business logic - only registering it in ProviderRegistry.ts.
// ============================================================================

export interface ResolvedTTSRequest {
  /** Already preprocessed (whitespace-normalized, chunk-sized) plain text. */
  text: string;
  /** Provider-native voice id, e.g. "af_bella" (Kokoro) or "th-TH-PremwadeeNeural" (Edge). */
  voice: string;
  speed: TTSSpeed;
}

export interface GeneratedAudio {
  /** Encoded audio bytes, always MP3 in this app (see OUTPUT_FORMAT in tts.config.ts). */
  buffer: Buffer;
  format: "mp3";
}

export interface TTSProvider {
  readonly name: TTSProviderName;
  generateSpeech(request: ResolvedTTSRequest): Promise<GeneratedAudio>;
  /** Voice ids this provider knows about - used for startup sanity checks / debug endpoints only. */
  listVoices(): string[];
}
