// ============================================================================
// Text normalization shared by every provider, run once in AudioService
// before the (provider-specific) synthesis call - so "respect punctuation",
// "split long paragraphs", etc. behave identically regardless of whether the
// request ends up on Kokoro or Edge.
// ============================================================================

/** Collapses runs of whitespace, trims, and normalizes line breaks to single spaces - preserves all punctuation as-is (commas/periods drive the provider's own natural pausing). */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

// Kept generous (well under any provider's practical request-size limit) so
// chunk boundaries land on natural sentence breaks rather than mid-sentence,
// which is what actually matters for "keep quotations natural" / "handle
// numbers and dates naturally" - a mid-sentence cut is what breaks those, not
// chunk length itself.
const MAX_CHUNK_CHARS = 600;

/**
 * Splits long text into TTS-request-sized chunks on sentence boundaries
 * (never mid-word, never mid-number/date/quotation) so a single long passage
 * still becomes several well-formed synthesis calls whose audio gets
 * concatenated back into one file. Short text (the common case - a single
 * paragraph or question) returns as one chunk, unchanged.
 */
export function splitIntoChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return [normalized];

  // Sentence-boundary split that doesn't break on abbreviations/decimals/
  // initials (Mr., U.S., 3.14) by requiring the next character after the
  // punctuation to be whitespace followed by an uppercase letter or a quote.
  const sentences = normalized.match(/[^.!?]+(?:[.!?]+(?=\s+[A-Z"'“]|\s*$)|[.!?]+$|$)/g) ?? [normalized];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const candidate = current ? `${current} ${trimmed}` : trimmed;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
}
