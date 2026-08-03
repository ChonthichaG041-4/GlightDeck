import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

/** Server origin with no "/api" suffix - for hitting routes mounted outside the API router. */
export function getServerOrigin(): string {
  return (api.defaults.baseURL ?? "").replace(/\/api\/?$/, "");
}

/**
 * Generated Listening audio URLs (Article.audioUrl/articleAudioUrl/etc,
 * AudioService.generate()'s result.url) now come from Supabase Storage and
 * are already absolute (https://<project>.supabase.co/storage/...) - see
 * apps/server/src/tts/services/AudioCache.ts. Older rows saved before that
 * migration can still have the old relative form (/audio-cache/<hash>.mp3,
 * served by our own Express server) sitting in the database, so this stays
 * defensive: pass an absolute URL through unchanged, only prefix a relative
 * one with the API server's origin. Always use this instead of manually
 * concatenating getServerOrigin() + url.
 */
export function resolveAudioUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${getServerOrigin()}${url}`;
}

let attached = false;

/** Call once near the app root (see App.tsx) to attach the Clerk session token to every request. */
export function useAttachAuthToken(getToken: () => Promise<string | null>) {
  if (attached) return;
  attached = true;
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}
