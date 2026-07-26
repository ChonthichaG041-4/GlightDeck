import type { TTSProvider } from "./TTSProvider";
import type { TTSProviderName } from "../config/tts.config";
import { KokoroProvider } from "./KokoroProvider";
import { EdgeProvider } from "./EdgeProvider";

// ============================================================================
// The ONE place new providers get wired in. Adding OpenAI/ElevenLabs/Azure/
// Google (or a second open-source engine) later means: write a class that
// implements TTSProvider, add one line here, add its language(s) to
// tts.config.ts. AudioService and every route stay untouched.
// ============================================================================

const providers: Record<TTSProviderName, TTSProvider> = {
  kokoro: new KokoroProvider(),
  edge: new EdgeProvider(),
};

export function getProvider(name: TTSProviderName): TTSProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`No TTS provider registered for "${name}"`);
  return provider;
}
