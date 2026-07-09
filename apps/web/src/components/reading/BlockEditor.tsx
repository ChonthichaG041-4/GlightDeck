// Rich block editor: Heading / Paragraph / Image / Quote / Table / Code / Divider.
// Mirrors the Block union in apps/server/src/lib/blocks.ts and api/hooks.ts.
import { useState } from "react";
import {
  Heading1, Pilcrow, ImageIcon, Quote as QuoteIcon, Table2, Code2, Minus,
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Block } from "@/api/hooks";

function randomBlockId() {
  return Math.random().toString(36).slice(2, 10);
}

const BLOCK_TYPES: { type: Block["type"]; label: string; icon: typeof Heading1 }[] = [
  { type: "HEADING", label: "Heading", icon: Heading1 },
  { type: "PARAGRAPH", label: "Paragraph", icon: Pilcrow },
  { type: "IMAGE", label: "Image", icon: ImageIcon },
  { type: "QUOTE", label: "Quote", icon: QuoteIcon },
  { type: "TABLE", label: "Table", icon: Table2 },
  { type: "CODE", label: "Code", icon: Code2 },
  { type: "DIVIDER", label: "Divider", icon: Minus },
];

function makeBlock(type: Block["type"]): Block {
  const id = randomBlockId();
  switch (type) {
    case "HEADING": return { id, type, level: 2, text: "" };
    case "PARAGRAPH": return { id, type, text: "" };
    case "IMAGE": return { id, type, url: "", caption: "" };
    case "QUOTE": return { id, type, text: "" };
    case "TABLE": return { id, type, rows: [["", ""], ["", ""]] };
    case "CODE": return { id, type, code: "", language: "" };
    case "DIVIDER": return { id, type };
  }
}

export default function BlockEditor({
  blocks, onChange, selectedId, onSelect,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  function updateBlock(i: number, patch: Partial<Block>) {
    onChange(blocks.map((b, idx) => (idx === i ? ({ ...b, ...patch } as Block) : b)));
  }
  function removeBlock(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function insertBlock(afterIdx: number, type: Block["type"]) {
    const next = [...blocks];
    next.splice(afterIdx + 1, 0, makeBlock(type));
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          ยังไม่มีเนื้อหา - เพิ่ม Block แรกของคุณด้านล่าง
        </p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id}>
          <Card
            onClick={() => onSelect?.(block.id)}
            className={cn("cursor-text transition-colors", selectedId === block.id && "border-primary ring-1 ring-primary/30")}
          >
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <GripVertical className="h-3 w-3" /> {block.type.toLowerCase()}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeBlock(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <BlockBody block={block} onChange={(patch) => updateBlock(i, patch)} />
            </CardContent>
          </Card>
          <AddBlockRow onAdd={(type) => insertBlock(i, type)} />
        </div>
      ))}

      {blocks.length === 0 && <AddBlockRow onAdd={(type) => insertBlock(-1, type)} />}
    </div>
  );
}

function BlockBody({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  switch (block.type) {
    case "HEADING":
      return (
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={block.level}
            onChange={(e) => onChange({ level: Number(e.target.value) as 1 | 2 | 3 })}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <Input value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="หัวข้อ..." className="font-semibold" />
        </div>
      );
    case "PARAGRAPH":
      return (
        <textarea
          className="h-24 w-full rounded-md border p-2 text-sm"
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="เขียนย่อหน้านี้..."
        />
      );
    case "IMAGE":
      return (
        <div className="space-y-1.5">
          <Input value={block.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://... รูปภาพ URL" />
          <Input value={block.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} placeholder="คำบรรยายภาพ (ไม่บังคับ)" className="text-xs" />
          {block.url && <img src={block.url} alt={block.caption ?? ""} className="max-h-48 rounded-md border object-cover" />}
        </div>
      );
    case "QUOTE":
      return (
        <textarea
          className="h-16 w-full rounded-md border-l-4 border-primary/40 bg-accent/30 p-2 text-sm italic"
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="ข้อความคำพูด..."
        />
      );
    case "TABLE":
      return <TableBody block={block} onChange={onChange} />;
    case "CODE":
      return (
        <div className="space-y-1.5">
          <Input value={block.language ?? ""} onChange={(e) => onChange({ language: e.target.value })} placeholder="ภาษา (เช่น js, python)" className="w-40 text-xs" />
          <textarea
            className="h-28 w-full rounded-md border bg-muted p-2 font-mono text-xs"
            value={block.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="โค้ด..."
          />
        </div>
      );
    case "DIVIDER":
      return <hr className="my-1 border-t-2" />;
  }
}

function TableBody({ block, onChange }: { block: Extract<Block, { type: "TABLE" }>; onChange: (patch: Partial<Block>) => void }) {
  const rows = block.rows;
  function setCell(r: number, c: number, value: string) {
    const next = rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row));
    onChange({ rows: next });
  }
  function addRow() {
    const cols = rows[0]?.length ?? 2;
    onChange({ rows: [...rows, Array(cols).fill("")] });
  }
  function addCol() {
    onChange({ rows: rows.map((row) => [...row, ""]) });
  }
  function removeRow(r: number) {
    onChange({ rows: rows.filter((_, ri) => ri !== r) });
  }
  return (
    <div className="space-y-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border p-1">
                  <input
                    className="w-full min-w-[70px] bg-transparent px-1 py-0.5 text-xs outline-none"
                    value={cell}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    placeholder={r === 0 ? "หัวคอลัมน์" : ""}
                  />
                </td>
              ))}
              <td>
                <button onClick={() => removeRow(r)} className="px-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={addRow}><Plus className="h-3 w-3" /> Row</Button>
        <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={addCol}><Plus className="h-3 w-3" /> Column</Button>
      </div>
    </div>
  );
}

function AddBlockRow({ onAdd }: { onAdd: (type: Block["type"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" /> Add Block
      </button>
      {open && (
        <div className="absolute left-1/2 z-10 mt-1 grid -translate-x-1/2 grid-cols-4 gap-1 rounded-lg border bg-popover p-2 shadow-md">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              onClick={() => { onAdd(bt.type); setOpen(false); }}
              className="flex flex-col items-center gap-1 rounded-md p-2 text-[10px] font-medium hover:bg-accent"
            >
              <bt.icon className="h-4 w-4" /> {bt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
