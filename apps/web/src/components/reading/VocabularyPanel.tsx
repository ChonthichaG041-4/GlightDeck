// Vocabulary panel: Auto Detect (AI scans the passage for difficult words) /
// Manual (curate your own list) / None.
import { useState } from "react";
import { Sparkles, Plus, Trash2, BookMarked } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useVocabularyDetect, type VocabularyItem } from "@/api/hooks";

const MODES: { value: "AUTO" | "MANUAL" | "NONE"; label: string }[] = [
  { value: "AUTO", label: "Auto Detect" },
  { value: "MANUAL", label: "Manual" },
  { value: "NONE", label: "None" },
];

export default function VocabularyPanel({
  mode, vocabulary, passage, onChange,
}: {
  mode: "AUTO" | "MANUAL" | "NONE";
  vocabulary: VocabularyItem[];
  passage: string;
  onChange: (patch: { mode?: "AUTO" | "MANUAL" | "NONE"; vocabulary?: VocabularyItem[] }) => void;
}) {
  const detect = useVocabularyDetect();
  const [error, setError] = useState<string | null>(null);

  function runAutoDetect() {
    if (!passage.trim()) {
      setError("เขียนเนื้อหาก่อนเพื่อให้ AI ตรวจคำศัพท์");
      return;
    }
    setError(null);
    detect.mutate(
      { passage, targetLang: "th" },
      {
        onSuccess: (data) => onChange({ vocabulary: data.vocabulary ?? [] }),
        onError: () => setError("ตรวจคำศัพท์ไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  function addRow() {
    onChange({ vocabulary: [...vocabulary, { headword: "", meaning: "", ipa: "" }] });
  }
  function updateRow(i: number, patch: Partial<VocabularyItem>) {
    onChange({ vocabulary: vocabulary.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  }
  function removeRow(i: number) {
    onChange({ vocabulary: vocabulary.filter((_, idx) => idx !== i) });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><BookMarked className="h-4 w-4" /> Vocabulary</p>

        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ mode: m.value })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                mode === m.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "AUTO" && (
          <p className="text-xs text-muted-foreground">ถ้าเปิด Auto Detect ระบบจะตรวจคำศัพท์ยาก แล้วสร้าง Dictionary อัตโนมัติ</p>
        )}

        {mode === "AUTO" && (
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={runAutoDetect} disabled={detect.isPending}>
              <Sparkles className="h-3.5 w-3.5" /> {detect.isPending ? "กำลังตรวจ..." : "ตรวจคำศัพท์อัตโนมัติ"}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <VocabList vocabulary={vocabulary} onUpdate={updateRow} onRemove={removeRow} />
          </div>
        )}

        {mode === "MANUAL" && (
          <div className="space-y-2">
            <VocabList vocabulary={vocabulary} onUpdate={updateRow} onRemove={removeRow} />
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={addRow}><Plus className="h-3.5 w-3.5" /> Add word</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VocabList({
  vocabulary, onUpdate, onRemove,
}: {
  vocabulary: VocabularyItem[];
  onUpdate: (i: number, patch: Partial<VocabularyItem>) => void;
  onRemove: (i: number) => void;
}) {
  if (vocabulary.length === 0) return <p className="text-xs text-muted-foreground">ยังไม่มีคำศัพท์</p>;
  return (
    <div className="space-y-1.5">
      {vocabulary.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={v.headword} onChange={(e) => onUpdate(i, { headword: e.target.value })} placeholder="คำศัพท์" className="w-32 text-xs" />
          <Input value={v.meaning} onChange={(e) => onUpdate(i, { meaning: e.target.value })} placeholder="ความหมาย" className="flex-1 text-xs" />
          <Input value={v.ipa ?? ""} onChange={(e) => onUpdate(i, { ipa: e.target.value })} placeholder="IPA" className="w-24 text-xs" />
          <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
