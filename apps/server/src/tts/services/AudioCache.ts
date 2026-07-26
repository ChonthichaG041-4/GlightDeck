import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ============================================================================
// Filesystem-backed audio cache. Cache key = language + accent + voice +
// speed + text (hashed, since text can be a whole passage) per spec. Simple
// on purpose - no DB table needed, no extra migration: a cached file's
// presence on disk IS the cache entry.
//
// Files live in apps/server/audio-cache/ (gitignored), served statically at
// /audio-cache/<hash>.mp3 by index.ts. On Render's ephemeral filesystem the
// cache resets on every deploy/restart - that's an acceptable tradeoff (first
// play after a restart regenerates, everything after that is instant) and
// avoids taking on a DB/S3 dependency just for this; swapping in a persistent
// object store later only means changing this one file.
// ============================================================================

// apps/server/src/tts/services -> apps/server (see tsconfig: rootDir "src",
// outDir "dist" - both are one level under apps/server, so this same
// three-levels-up path resolves correctly whether running compiled (dist/) or
// via tsx (src/) directly).
const CACHE_DIR = path.join(__dirname, "..", "..", "..", "audio-cache");

export const AUDIO_CACHE_URL_PREFIX = "/audio-cache";

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function cacheKeyFor(params: { provider: string; voice: string; speed: number; text: string }): string {
  const hash = crypto.createHash("sha256");
  hash.update(`${params.provider}|${params.voice}|${params.speed}|${params.text}`);
  return hash.digest("hex");
}

function filePathFor(key: string): string {
  return path.join(CACHE_DIR, `${key}.mp3`);
}

export function getCacheDir(): string {
  return CACHE_DIR;
}

export function hasCached(key: string): boolean {
  return fs.existsSync(filePathFor(key));
}

export async function saveToCache(key: string, buffer: Buffer): Promise<void> {
  ensureCacheDir();
  await fs.promises.writeFile(filePathFor(key), buffer);
}

export function publicUrlFor(key: string): string {
  return `${AUDIO_CACHE_URL_PREFIX}/${key}.mp3`;
}
