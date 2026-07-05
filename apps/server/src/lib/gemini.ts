// Shared helpers for calling the Gemini API across ai.ts / reading.ts / listening.ts:
// retrying automatically on a transient "server overloaded" error, and turning a raw
// SDK error into an accurate (non-misleading) Thai message for the client.
//
// Why this exists: every Gemini-calling route previously reported ANY failure with
// "check your GEMINI_API_KEY / it might be invalid or out of quota". That's wrong when
// the real cause is Gemini's own 503 UNAVAILABLE "the model is experiencing high demand"
// error - a temporary Google-side hiccup that has nothing to do with the user's key and
// often succeeds on a quick retry. This module tells the two apart.

function errorText(err: any): string {
  return `${err?.message ?? err ?? ""}`;
}

/** Gemini 503 UNAVAILABLE / "model is overloaded" / "high demand" - transient, retry-worthy. */
export function isGeminiOverloaded(err: any): boolean {
  const text = errorText(err);
  return (
    err?.status === 503 ||
    err?.code === 503 ||
    /"code"\s*:\s*503/.test(text) ||
    /UNAVAILABLE/i.test(text) ||
    /overloaded|high demand/i.test(text)
  );
}

/** Actual auth/quota problems - retrying won't help, the key genuinely needs attention. */
export function isGeminiAuthOrQuotaError(err: any): boolean {
  const text = errorText(err);
  return (
    err?.status === 401 ||
    err?.status === 403 ||
    err?.status === 429 ||
    /"code"\s*:\s*(401|403|429)/.test(text) ||
    /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|RESOURCE_EXHAUSTED|quota/i.test(text)
  );
}

/**
 * Runs `fn` and automatically retries (with short exponential backoff) if Gemini
 * reports a transient overload. Any other kind of error is rethrown immediately -
 * no point retrying an invalid API key or a malformed request.
 */
export async function withGeminiRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 700): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isGeminiOverloaded(err) || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

/**
 * Builds the Thai-language note sent back to the client, distinguishing three cases:
 * transient overload (not the user's fault, retry shortly), real auth/quota problems
 * (the key genuinely needs checking), and everything else (generic connection failure).
 * `featureLabel` is a short Thai description of what was being generated, e.g. "สร้างชุดคำศัพท์ด้วย Gemini".
 */
export function friendlyGeminiError(err: any, featureLabel: string): string {
  const detail = errorText(err) || "unknown error";
  if (isGeminiOverloaded(err)) {
    return (
      `${featureLabel}ไม่สำเร็จ เพราะขณะนี้ Gemini มีผู้ใช้งานหนาแน่นชั่วคราว (ไม่ใช่ปัญหาที่ API key ของคุณ) ` +
      `กรุณาลองใหม่อีกครั้งในอีกสักครู่ [${detail}]`
    );
  }
  if (isGeminiAuthOrQuotaError(err)) {
    return (
      `${featureLabel}ไม่สำเร็จ (คีย์ไม่ถูกต้องหรือโควต้าหมด) กรุณาตรวจสอบ GEMINI_API_KEY ในไฟล์ apps/server/.env แล้วลองใหม่อีกครั้ง ` +
      `[${detail}]`
    );
  }
  return `${featureLabel}ไม่สำเร็จ (เชื่อมต่อ Gemini API ไม่ได้) กรุณาลองใหม่อีกครั้ง [${detail}]`;
}
