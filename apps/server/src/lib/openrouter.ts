// OpenRouter (https://openrouter.ai) helper - used ONLY by the Import Book/Reading
// (OCR) route so far. Every other AI feature in this app still runs on Gemini
// (see lib/gemini.ts) - this is a deliberate per-feature choice, not a provider
// migration, because Import Book/Reading's per-page-image cost adds up fastest
// and a free vision model is a good fit for it specifically.
//
// Runs on OpenRouter's free tier - $0 per token, subject to OpenRouter's
// free-tier rate limits: 50 requests/day per account, or 1000/day once you've
// bought at least $10 of credits (see https://openrouter.ai/docs/faq). Set
// OPENROUTER_MODEL to pin a single exact model/variant instead (disables the
// fallback list below entirely).
//
// No response_format/json_schema is requested here - OpenRouter's structured-
// outputs feature isn't guaranteed to be supported by whichever backend serves
// a given request for a free-tier model, and an unsupported strict schema would
// hard-fail the request. Instead the prompt itself spells out the exact JSON
// shape (same approach already used for the Anthropic call in routes/ai.ts's
// /explain endpoint), and the caller extracts/parses the JSON defensively.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Individual free-tier vision model slugs (e.g. specific Qwen2.5-VL variants)
// churn constantly - a slug can go from "live" to "no endpoints found" (404),
// or get pulled from the free tier entirely with no warning, whenever its
// sole hosting provider stops offering it for free (confirmed twice while
// building this feature). Rather than hardcode specific model slugs, this
// uses OpenRouter's own "openrouter/free" router model: it auto-selects among
// whatever free models are live *right now* and specifically filters for
// ones that support image understanding (see https://openrouter.ai/openrouter/free).
// That makes it immune to any single free model being deprecated or renamed.
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

// Kept as a short candidate list (passed via OpenRouter's built-in "models"
// fallback field: https://openrouter.ai/docs/guides/routing/model-fallbacks)
// so that if the free router itself ever has an off day, OpenRouter retries
// against a known-good free vision-capable model server-side, in one round
// trip. Stays free-only by design (no paid fallback) so this feature never
// silently spends money - if every entry here is down, the request fails
// with a clear error instead of quietly charging the account.
export const DEFAULT_OPENROUTER_FALLBACKS = [
  "openrouter/free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

function errorText(err: any): string {
  return `${err?.message ?? err ?? ""}`;
}

/** Transient - provider overloaded / no backend currently available for this (often free) model. Retry-worthy. */
export function isOpenRouterOverloaded(err: any): boolean {
  const text = errorText(err);
  return err?.status === 502 || err?.status === 503 || /overloaded|no.*provider.*available|temporarily unavailable/i.test(text);
}

/** Free-tier daily request cap hit, or a real auth/quota problem - retrying won't help. */
export function isOpenRouterRateLimited(err: any): boolean {
  return err?.status === 429;
}

export function isOpenRouterAuthError(err: any): boolean {
  return err?.status === 401 || err?.status === 403;
}

export async function withOpenRouterRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 1200): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isOpenRouterOverloaded(err) || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Thai-language note for the client, distinguishing the failure modes that actually matter to the user. */
export function friendlyOpenRouterError(err: any, featureLabel: string): string {
  const detail = errorText(err) || "unknown error";
  if (isOpenRouterRateLimited(err)) {
    return (
      `${featureLabel}ไม่สำเร็จ เพราะโมเดลฟรีของ OpenRouter ถึงโควต้ารายวันแล้ว (ฟรี 50 ครั้ง/วัน หรือ 1000 ครั้ง/วันถ้าเติมเครดิตอย่างน้อย $10) ` +
      `กรุณาลองใหม่พรุ่งนี้ หรือเติมเครดิตที่ openrouter.ai/credits [${detail}]`
    );
  }
  if (isOpenRouterAuthError(err)) {
    return (
      `${featureLabel}ไม่สำเร็จ (คีย์ไม่ถูกต้อง) กรุณาตรวจสอบ OPENROUTER_API_KEY ในไฟล์ apps/server/.env ` +
      `(ขอคีย์ได้ที่ openrouter.ai/keys) แล้วลองใหม่อีกครั้ง [${detail}]`
    );
  }
  if (isOpenRouterOverloaded(err)) {
    return (
      `${featureLabel}ไม่สำเร็จ เพราะขณะนี้ไม่มีผู้ให้บริการโมเดลนี้ว่าง (พบได้บ่อยกับโมเดลฟรีช่วงคนใช้เยอะ) ` +
      `กรุณาลองใหม่อีกครั้งในอีกสักครู่ [${detail}]`
    );
  }
  return `${featureLabel}ไม่สำเร็จ (เชื่อมต่อ OpenRouter API ไม่ได้) กรุณาลองใหม่อีกครั้ง [${detail}]`;
}

export interface OpenRouterImagePart {
  mimeType: string;
  base64: string;
}

/**
 * Sends one system + user (text + images) turn to OpenRouter's OpenAI-compatible
 * chat completions endpoint and returns the raw assistant text. Throws an Error
 * with a `.status` set to the HTTP status code on non-2xx responses, so the
 * helpers above can classify the failure.
 */
export async function callOpenRouterVision({
  systemPrompt, userText, images, apiKey, model, models, temperature = 0.2,
}: {
  systemPrompt: string;
  userText: string;
  images: OpenRouterImagePart[];
  apiKey: string;
  /** Single explicit model slug - overrides the fallback list entirely if set. */
  model?: string;
  /** Ordered list of candidate model slugs - OpenRouter tries each in turn server-side. */
  models?: string[];
  temperature?: number;
}): Promise<string> {
  const content: any[] = [{ type: "text", text: userText }];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }

  const candidateList = model
    ? undefined
    : models ?? (process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : DEFAULT_OPENROUTER_FALLBACKS);

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Optional but recommended by OpenRouter so requests are attributed to this app.
      "HTTP-Referer": "https://glightdeck.onrender.com",
      "X-Title": "LingoDeck - Import Book/Reading",
    },
    body: JSON.stringify({
      model: model || candidateList![0],
      ...(candidateList && candidateList.length > 1 ? { models: candidateList } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      temperature,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const err: any = new Error(`OpenRouter API error ${response.status}: ${bodyText.slice(0, 500)}`);
    err.status = response.status;
    throw err;
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("OpenRouter returned an empty response");
  return text;
}

/**
 * Best-effort JSON extraction - free-tier models (especially whichever one
 * "openrouter/free" happens to route to on a given call) are inconsistent
 * about following "reply with ONLY JSON": some wrap it in ```json fences,
 * some add a sentence before/after, some leave a trailing comma. This tries
 * increasingly forgiving strategies before giving up, and always throws an
 * error that carries a snippet of the raw text so the caller can log it.
 */
export function extractJsonObject(raw: string): any {
  const attempts: string[] = [];

  // 1) Whole response, as-is (handles well-behaved models).
  attempts.push(raw.trim());

  // 2) Strip ```json ... ``` or ``` ... ``` code fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());

  // 3) First "{" through the LAST "}" in the text (drops leading/trailing prose).
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) attempts.push(braceMatch[0]);

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 4) Same candidate, but with trailing commas before } or ] removed -
      // a common small mistake from non-JSON-mode models.
      try {
        return JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1"));
      } catch {
        // try the next candidate
      }
    }
  }

  const snippet = raw.slice(0, 800);
  const err: any = new Error(
    `No valid JSON object found in the model's response. Raw response (first 800 chars): ${snippet}`
  );
  err.rawResponse = raw;
  throw err;
}
