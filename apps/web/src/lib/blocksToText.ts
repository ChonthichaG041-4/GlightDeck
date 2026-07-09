// Client-side mirror of apps/server/src/lib/blocks.ts's blocksToPlainText -
// lets the Create composer preview/AI-assist the passage text before saving,
// without a round-trip to the server.
import type { Block } from "@/api/hooks";

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

export function randomBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function plainTextToBlocks(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ id: randomBlockId(), type: "PARAGRAPH" as const, text: p }));
}
