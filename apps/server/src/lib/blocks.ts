// Shared rich-content "block" structure for the unified Generate/Create reading
// composer's Editor (Heading/Paragraph/Image/Quote/Table/Code/Divider). This is
// the authoring-time representation, persisted as Article.blocksJson; the
// existing plain-text Article.content field is kept in sync as a flattened
// mirror so nothing else in the app (Reading Workspace's renderer, word
// lookups, highlights/offsets, AI passage generation, etc.) needs to change -
// they all keep reading/writing plain text exactly as before.

export type Block =
  | { id: string; type: "HEADING"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "PARAGRAPH"; text: string }
  | { id: string; type: "IMAGE"; url: string; caption?: string }
  | { id: string; type: "QUOTE"; text: string }
  | { id: string; type: "TABLE"; rows: string[][] }
  | { id: string; type: "CODE"; code: string; language?: string }
  | { id: string; type: "DIVIDER" };

export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "HEADING":
          return b.text;
        case "PARAGRAPH":
          return b.text;
        case "IMAGE":
          return b.caption ?? "";
        case "QUOTE":
          return b.text ? `"${b.text}"` : "";
        case "TABLE":
          return b.rows.map((r) => r.join(" | ")).join("\n");
        case "CODE":
          return b.code;
        case "DIVIDER":
          return "";
        default:
          return "";
      }
    })
    .filter((t) => t.trim().length > 0)
    .join("\n\n");
}

/** Best-effort fallback: turn plain text (e.g. a freshly-generated AI passage,
 * or content with no block structure yet) into simple Paragraph blocks. */
export function plainTextToBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ id: randomBlockId(), type: "PARAGRAPH" as const, text: p }));
}

export function randomBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}
