// Shared header fields for the unified Generate/Create composer layout:
// Title, Description, Category, Tags, Difficulty, Test Mode. Used as-is by
// CreateModeTab; ReadingGenerator (Generate tab) reuses Difficulty/Test Mode
// via the same DIFFICULTY_CARDS/TEST_MODES constants for consistency, and
// keeps its own AI-specific wizard fields (Topic, Length, Style, ...) below.
import { useState, type KeyboardEvent } from "react";
import { Type, AlignLeft, FolderOpen, Tags, BarChart3, ClipboardList, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldLabel, OptionCard, PillButton } from "./primitives";
import { DIFFICULTY_CARDS, TEST_MODES } from "./composerConstants";

export interface PassageMeta {
  title: string;
  description: string;
  category: string;
  tags: string[];
  cefrLevel: string;
  testMode: string;
}

export default function PassageMetaFields({
  meta, onChange,
}: {
  meta: PassageMeta;
  onChange: (patch: Partial<PassageMeta>) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const t = tagDraft.trim();
    if (t && !meta.tags.includes(t)) onChange({ tags: [...meta.tags, t] });
    setTagDraft("");
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagDraft && meta.tags.length) {
      onChange({ tags: meta.tags.slice(0, -1) });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel icon={<Type className="h-4 w-4" />} text="Title" />
        <Input value={meta.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="ชื่อบทความของคุณ..." />
      </div>

      <div>
        <FieldLabel icon={<AlignLeft className="h-4 w-4" />} text="Description" />
        <textarea
          className="h-20 w-full rounded-md border p-2 text-sm"
          placeholder="สรุปสั้น ๆ ว่าบทความนี้เกี่ยวกับอะไร (ไม่บังคับ)..."
          value={meta.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel icon={<FolderOpen className="h-4 w-4" />} text="Category" />
          <Input value={meta.category} onChange={(e) => onChange({ category: e.target.value })} placeholder="News, Story, Business..." />
        </div>
        <div>
          <FieldLabel icon={<Tags className="h-4 w-4" />} text="Tags" />
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
            {meta.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
                {t}
                <button type="button" onClick={() => onChange({ tags: meta.tags.filter((x) => x !== t) })} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              className="min-w-[80px] flex-1 border-0 bg-transparent text-xs outline-none"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={addTag}
              placeholder={meta.tags.length ? "" : "พิมพ์แล้วกด Enter..."}
            />
          </div>
        </div>
      </div>

      <div>
        <FieldLabel icon={<BarChart3 className="h-4 w-4" />} text="Difficulty" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIFFICULTY_CARDS.map((d) => (
            <OptionCard
              key={d.value}
              active={meta.cefrLevel === d.value}
              onClick={() => onChange({ cefrLevel: d.value })}
              icon={<d.icon className="h-5 w-5" />}
              title={d.title}
              description={d.description}
            />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel icon={<ClipboardList className="h-4 w-4" />} text="Test Mode" />
        <div className="flex flex-wrap gap-1.5">
          {TEST_MODES.map((t) => (
            <PillButton key={t.value} active={meta.testMode === t.value} onClick={() => onChange({ testMode: t.value })}>{t.label}</PillButton>
          ))}
        </div>
      </div>
    </div>
  );
}
