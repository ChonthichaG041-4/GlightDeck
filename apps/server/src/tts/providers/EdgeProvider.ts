import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { GeneratedAudio, ResolvedTTSRequest, TTSProvider } from "./TTSProvider";
import { TTS_CONFIG, SUPPORTED_LANGUAGES } from "../config/tts.config";

// ============================================================================
// Every non-English language - Microsoft Edge's "Read Aloud" neural TTS
// service, the same free/unofficial endpoint the Python `edge-tts` package
// talks to, here via the `msedge-tts` Node client (no API key, no cost -
// it's the same service Edge's built-in reader uses, not an Azure Speech
// subscription). Requires outbound network access to Microsoft's endpoint;
// unlike Kokoro this is NOT fully self-hosted, but it is 100% free and not a
// paid API, matching the "free, self-hosted/open-source" spirit for every
// language that doesn't have a viable open-weight model as good as Kokoro yet.
//
// NOTE: `msedge-tts`'s exact per-call options shape (rate/pitch/volume) has
// shifted across its 2.x releases. If speed control stops working after a
// version bump, check node_modules/msedge-tts/dist/MsEdgeTTS.d.ts for the
// current toStream() signature - everything speed-related in this app is
// isolated to the one call below, nothing else needs to change.
// ============================================================================

/** speed 0.8-1.2 -> Edge's SSML prosody rate percentage, e.g. 1.2 -> "+20%", 0.8 -> "-20%". */
function speedToRatePercent(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class EdgeProvider implements TTSProvider {
  readonly name = "edge" as const;

  async generateSpeech({ text, voice, speed }: ResolvedTTSRequest): Promise<GeneratedAudio> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const rate = speedToRatePercent(speed);
    const { audioStream } = await tts.toStream(text, { rate } as any);
    const buffer = await streamToBuffer(audioStream);
    return { buffer, format: "mp3" };
  }

  listVoices(): string[] {
    return SUPPORTED_LANGUAGES.filter((lang) => TTS_CONFIG[lang].provider === "edge").map((lang) => {
      const cfg = TTS_CONFIG[lang];
      return cfg.provider === "edge" ? cfg.voice : "";
    });
  }
}
