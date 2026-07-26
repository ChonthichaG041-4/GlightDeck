import type { GeneratedAudio, ResolvedTTSRequest, TTSProvider } from "./TTSProvider";
import { TTS_CONFIG } from "../config/tts.config";

// ============================================================================
// English TTS - Kokoro (https://github.com/hexgrad/kokoro), an open-weight
// ~82M-param model. Runs fully self-hosted, in-process, via kokoro-js
// (onnxruntime under the hood, no Python, no external service, no API key,
// $0 cost). Model weights (~80-300MB depending on quantization) download
// once from the Hugging Face Hub on first use and are cached to disk by
// @huggingface/transformers afterwards - the very first request after a
// fresh deploy will be slow while that download happens; every request after
// that (across restarts, since the cache is on disk) is fast.
//
// Kokoro's `generate()` returns raw PCM (RawAudio: Float32Array samples +
// sample rate), not MP3 - @breezystack/lamejs (pure JS, no native/ffmpeg
// dependency, safe on Render's standard Node build) encodes it to MP3 here so
// every provider in this app returns the exact same GeneratedAudio shape
// regardless of what the underlying engine natively speaks. Specifically the
// @breezystack fork, NOT the original unscoped "lamejs" package - the
// original throws "ReferenceError: MPEGMode is not defined" the instant
// Mp3Encoder is constructed under Node (its files assume a browser <script>
// environment where that class attaches to the global scope); the fork fixes
// that packaging bug while keeping the same encodeBuffer()/flush() API.
//
// Must be `import()`ed dynamically, not statically - the package is ESM-only
// ("type": "module") and its "require" export condition points at a
// browser-style IIFE bundle, not real CJS. A static `import { Mp3Encoder }
// from "@breezystack/lamejs"` gets rewritten to a `require()` call under
// tsx's CJS interop and resolves to that IIFE build, where `Mp3Encoder` isn't
// a real export - it fails at call time with "Mp3Encoder is not a
// constructor". A dynamic `import()` always goes through Node's real ESM
// resolver (even from CJS code) and correctly hits the ESM build instead -
// same reason kokoro-js is loaded dynamically in loadModel() below.
// ============================================================================

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
// "q8" is the quantized weights - much smaller download and faster CPU
// inference than fp32, with only a minor, generally inaudible quality cost.
// Override via KOKORO_DTYPE in apps/server/.env if a different tradeoff is wanted.
const KOKORO_DTYPE = (process.env.KOKORO_DTYPE as "fp32" | "fp16" | "q8" | "q4" | undefined) ?? "q8";

const MP3_BITRATE_KBPS = 64;

let modelPromise: Promise<any> | null = null;

/** Lazily loads (and caches) the Kokoro model - only paid for on the first request that actually needs English TTS. */
async function loadModel(): Promise<any> {
  if (!modelPromise) {
    const startedAt = Date.now();
    console.log(`[Kokoro] loading model "${KOKORO_MODEL_ID}" (dtype=${KOKORO_DTYPE})... first run downloads ` +
      `the weights from Hugging Face (tens to a few hundred MB) and caches them to disk - this can take a ` +
      `while depending on your connection. Every request after this one (across server restarts, since the ` +
      `cache is on disk) resolves in a couple seconds.`);
    modelPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const model = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: KOKORO_DTYPE });
      console.log(`[Kokoro] model ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return model;
    })().catch((err) => {
      // Don't cache a rejected promise - a transient download failure
      // shouldn't permanently break English TTS until the next process restart.
      modelPromise = null;
      console.error("[Kokoro] model load failed:", err?.message ?? err);
      throw err;
    });
  }
  return modelPromise;
}

/**
 * Kicks off the (lazy, memoized) model load in the background without
 * blocking anything - called once from index.ts right after the server
 * starts listening, so real users hitting "play" a few seconds/minutes into
 * a dev session usually land on an already-warm model instead of triggering
 * the full download+init themselves with zero feedback in the UI (which is
 * what made a cold start look "frozen"/broken rather than just slow).
 * Safe to call redundantly - loadModel() is a no-op if already in flight.
 */
export function warmUpKokoro(): void {
  loadModel().catch(() => {
    // Already logged inside loadModel() - nothing else to do here. The next
    // real request will simply retry the load (modelPromise was reset).
  });
}

/** Float32 PCM in [-1, 1] -> Int16 PCM, the format the MP3 encoder expects. */
function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => {
  encodeBuffer(samples: Int16Array): Uint8Array;
  flush(): Uint8Array;
};

let mp3EncoderCtorPromise: Promise<Mp3EncoderCtor> | null = null;

/** Lazily loads (and caches) the Mp3Encoder constructor - see the dynamic-import note above for why this can't just be a top-level `import`. */
async function loadMp3EncoderCtor(): Promise<Mp3EncoderCtor> {
  if (!mp3EncoderCtorPromise) {
    mp3EncoderCtorPromise = import("@breezystack/lamejs").then((mod: any) => {
      const ctor = mod.Mp3Encoder ?? mod.default?.Mp3Encoder;
      if (typeof ctor !== "function") {
        throw new Error("@breezystack/lamejs: Mp3Encoder export not found (unexpected module shape)");
      }
      return ctor;
    });
  }
  return mp3EncoderCtorPromise;
}

async function encodeMp3(samples: Int16Array, sampleRate: number): Promise<Buffer> {
  const Mp3Encoder = await loadMp3EncoderCtor();
  const encoder = new Mp3Encoder(1, sampleRate, MP3_BITRATE_KBPS);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export class KokoroProvider implements TTSProvider {
  readonly name = "kokoro" as const;

  async generateSpeech({ text, voice, speed }: ResolvedTTSRequest): Promise<GeneratedAudio> {
    const tts = await loadModel();
    // Kokoro's own `speed` option (0.5-2.0, natural-sounding time-stretch
    // done inside the model rather than naive audio resampling afterwards).
    const audio = await tts.generate(text, { voice, speed });
    const pcm16 = floatTo16BitPCM(audio.audio as Float32Array);
    const buffer = await encodeMp3(pcm16, audio.sampling_rate as number);
    return { buffer, format: "mp3" };
  }

  listVoices(): string[] {
    const cfg = TTS_CONFIG.en;
    if (cfg.provider !== "kokoro") return [];
    const ids = new Set<string>();
    for (const accent of Object.values(cfg.voices)) {
      for (const voiceId of Object.values(accent)) ids.add(voiceId);
    }
    for (const alt of cfg.alternates ?? []) ids.add(alt.id);
    return Array.from(ids);
  }
}
