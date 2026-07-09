// Manual Question Builder: Multiple Choice, Fill Blank, Essay, True/False,
// Matching, Ordering (+ Short Answer / Yes-No-Not Given, which already exist
// in the ReadingQuestion type). Mirrors ReadingQuestion in api/hooks.ts.
import { useState } from "react";
import { Plus, Trash2, ListChecks, GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReadingQuestion, ReadingQuestionType } from "@/api/hooks";

const TYPE_OPTIONS: { value: ReadingQuestionType; label: string }[] = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "FILL_BLANK", label: "Fill Blank" },
  { value: "ESSAY", label: "Essay" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "MATCHING", label: "Matching" },
  { value: "ORDERING", label: "Ordering" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "YES_NO_NOTGIVEN", label: "Yes / No / Not Given" },
];

function emptyQuestion(type: ReadingQuestionType = "MULTIPLE_CHOICE"): ReadingQuestion {
  const base = { type, skill: "Reading Comprehension", prompt: "", options: [] as string[], answer: "" };
  if (type === "MULTIPLE_CHOICE") return { ...base, options: ["", ""] };
  if (type === "TRUE_FALSE") return { ...base, options: ["True", "False"] };
  if (type === "YES_NO_NOTGIVEN") return { ...base, options: ["Yes", "No", "Not Given"] };
  if (type === "MATCHING") return { ...base, pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
  if (type === "ORDERING") return { ...base, items: ["", ""] };
  return base;
}

export default function QuestionBuilder({
  questions, onChange,
}: {
  questions: ReadingQuestion[];
  onChange: (questions: ReadingQuestion[]) => void;
}) {
  function addQuestion() {
    onChange([...questions, emptyQuestion()]);
  }
  function updateQuestion(i: number, patch: Partial<ReadingQuestion>) {
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function changeType(i: number, type: ReadingQuestionType) {
    const prompt = questions[i].prompt;
    onChange(questions.map((q, idx) => (idx === i ? { ...emptyQuestion(type), prompt } : q)));
  }
  function removeQuestion(i: number) {
    onChange(questions.filter((_, idx) => idx !== i));
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Question Builder</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addQuestion}>
            <Plus className="h-3.5 w-3.5" /> Question
          </Button>
        </div>

        {questions.length === 0 && <p className="text-xs text-muted-foreground">เพิ่มคำถามให้ผู้อ่านตอบหลังอ่านจบ (ไม่บังคับ)</p>}

        {questions.map((q, i) => (
          <div key={i} className="space-y-2.5 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Question {i + 1}</p>
              <button onClick={() => removeQuestion(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => changeType(i, t.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    q.type === t.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <Input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })} placeholder="คำถาม..." />

            <QuestionTypeFields question={q} onChange={(patch) => updateQuestion(i, patch)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionTypeFields({ question, onChange }: { question: ReadingQuestion; onChange: (patch: Partial<ReadingQuestion>) => void }) {
  function setOption(idx: number, value: string) {
    onChange({ options: question.options.map((o, i) => (i === idx ? value : o)) });
  }
  function addOption() {
    onChange({ options: [...question.options, ""] });
  }
  function removeOption(idx: number) {
    const next = question.options.filter((_, i) => i !== idx);
    onChange({ options: next, answer: question.answer === question.options[idx] ? "" : question.answer });
  }

  switch (question.type) {
    case "MULTIPLE_CHOICE":
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">เลือกวงกลมหน้าตัวเลือกที่ถูกต้อง</p>
          {question.options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="radio" checked={question.answer === opt && opt !== ""} onChange={() => onChange({ answer: opt })} />
              <Input value={opt} onChange={(e) => { setOption(idx, e.target.value); if (question.answer === opt) onChange({ answer: e.target.value }); }} placeholder={`ตัวเลือก ${idx + 1}`} />
              {question.options.length > 2 && (
                <button onClick={() => removeOption(idx)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={addOption}><Plus className="h-3 w-3" /> Option</Button>
        </div>
      );

    case "TRUE_FALSE":
    case "YES_NO_NOTGIVEN":
      return (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange({ answer: opt })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                question.answer === opt ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case "FILL_BLANK":
      return <Input value={question.answer} onChange={(e) => onChange({ answer: e.target.value })} placeholder="คำตอบที่ถูกต้อง (คำที่หายไป)" />;

    case "SHORT_ANSWER":
      return <Input value={question.answer} onChange={(e) => onChange({ answer: e.target.value })} placeholder="คำตอบที่ถูกต้อง" />;

    case "ESSAY":
      return (
        <textarea
          className="h-20 w-full rounded-md border p-2 text-xs"
          value={question.answer}
          onChange={(e) => onChange({ answer: e.target.value })}
          placeholder="คำตอบตัวอย่าง / เกณฑ์การให้คะแนน (ไม่บังคับ)"
        />
      );

    case "MATCHING": {
      const pairs = question.pairs ?? [];
      return (
        <div className="space-y-1.5">
          {pairs.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input value={p.left} onChange={(e) => onChange({ pairs: pairs.map((pp, i) => (i === idx ? { ...pp, left: e.target.value } : pp)) })} placeholder="ซ้าย" />
              <span className="text-muted-foreground">—</span>
              <Input value={p.right} onChange={(e) => onChange({ pairs: pairs.map((pp, i) => (i === idx ? { ...pp, right: e.target.value } : pp)) })} placeholder="ขวา" />
              {pairs.length > 2 && (
                <button onClick={() => onChange({ pairs: pairs.filter((_, i) => i !== idx) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => onChange({ pairs: [...pairs, { left: "", right: "" }] })}>
            <Plus className="h-3 w-3" /> Pair
          </Button>
        </div>
      );
    }

    case "ORDERING": {
      const items = question.items ?? [];
      function moveItem(i: number, dir: -1 | 1) {
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        onChange({ items: next });
      }
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">เรียงลำดับตามที่ถูกต้อง (ใช้ลูกศรจัดลำดับ)</p>
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{idx + 1}.</span>
              <Input value={it} onChange={(e) => onChange({ items: items.map((x, i) => (i === idx ? e.target.value : x)) })} placeholder={`ขั้นตอน ${idx + 1}`} />
              <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">↑</button>
              <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">↓</button>
              {items.length > 2 && (
                <button onClick={() => onChange({ items: items.filter((_, i) => i !== idx) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => onChange({ items: [...items, ""] })}>
            <Plus className="h-3 w-3" /> Step
          </Button>
        </div>
      );
    }

    default:
      return null;
  }
}
