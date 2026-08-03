import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Supabase Storage-backed audio cache. Cache key = provider + voice + speed +
// text (hashed, since text can be a whole passage) per spec - a cached
// object's presence in the bucket IS the cache entry, exactly like the old
// filesystem version, just durable instead of ephemeral.
//
// This used to write MP3s straight to local disk (apps/server/audio-cache/),
// served statically by index.ts. That worked but had a real problem on
// Render's free tier: the filesystem is EPHEMERAL - it resets on every
// deploy AND every crash-triggered restart (including the OOM restarts this
// app has hit repeatedly), so cached audio for every user, not just newly
// imported articles, kept vanishing and re-synthesizing constantly. Moving
// the cache to Supabase Storage fixes that (survives restarts) and, as a
// bonus, means audio generated locally during dev (e.g. via Import Reading
// from Images run on your own machine to avoid Render's 512MB limit - see
// migrate-articles.ts) lands in the SAME bucket production reads from, so
// migrating an article's audioUrl fields to production is just copying a
// few already-working URLs, no separate file-upload step needed.
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Settings -> API in your
// Supabase project dashboard - the service role key, not the anon key, since
// this writes server-side with no user session) and a Storage bucket (create
// it under Storage in the dashboard; name it via SUPABASE_AUDIO_BUCKET or it
// defaults to "audio-cache") set to PUBLIC so publicUrlFor's URLs are
// directly playable with no signing/proxy step. Use the SAME project/bucket
// for local dev and production so the "generate locally, migrate the row"
// workflow above actually works - a separate bucket per environment would
// defeat the point.
// ============================================================================

const BUCKET = process.env.SUPABASE_AUDIO_BUCKET || "audio-cache";

let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Audio generation requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set (apps/server/.env) - " +
        "get these from your Supabase project's Settings -> API page, and make sure a PUBLIC Storage bucket " +
        `named "${BUCKET}" exists (Storage -> New bucket in the dashboard) before generating any audio.`
    );
  }
  cachedClient = createClient(url, key);
  return cachedClient;
}

export function cacheKeyFor(params: { provider: string; voice: string; speed: number; text: string }): string {
  const hash = crypto.createHash("sha256");
  hash.update(`${params.provider}|${params.voice}|${params.speed}|${params.text}`);
  return hash.digest("hex");
}

function objectNameFor(key: string): string {
  return `${key}.mp3`;
}

export async function hasCached(key: string): Promise<boolean> {
  const name = objectNameFor(key);
  const { data, error } = await getClient().storage.from(BUCKET).list("", { search: name });
  if (error) {
    // Treat a check failure as "not cached" rather than throwing - the
    // caller falls through to (re)synthesizing, which is always safe, just
    // wastes a TTS call in the rare case this was really a transient error.
    console.error("[AudioCache] existence check failed, will (re)generate instead:", error.message);
    return false;
  }
  return !!data?.some((f) => f.name === name);
}

export async function saveToCache(key: string, buffer: Buffer): Promise<void> {
  const { error } = await getClient()
    .storage.from(BUCKET)
    .upload(objectNameFor(key), buffer, {
      contentType: "audio/mpeg",
      // Safe to overwrite unconditionally: the object name is a content
      // hash, so a "collision" is always the exact same bytes anyway.
      upsert: true,
    });
  if (error) throw new Error(`Failed to upload audio to Supabase Storage bucket "${BUCKET}": ${error.message}`);
}

export function publicUrlFor(key: string): string {
  const { data } = getClient().storage.from(BUCKET).getPublicUrl(objectNameFor(key));
  return data.publicUrl;
}
