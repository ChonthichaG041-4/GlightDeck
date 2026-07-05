import { useState } from "react";
import {
  Plus, Trash2, Sparkles, Wand2, Scissors, Maximize2, SpellCheck2, ArrowRightCircle,
  Share2, Save, ListChecks, CheckCircle2, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePassage, useUpdatePassage, useWritingAssist, usePassage } from "@/api/hooks";
import { cn } from "@/lib/utils";

type Instruction = "CONTINUE" | "IMPROVE" | "FIX_GRAMMAR" | "SHORTEN" | "EXPAND";

const ASSIST_ACTIONS: { value: Instruction; label: string; icon: React.ReactNode }[] = [
  { value: "CONTINUE", label: "Continue", icon: <ArrowRightCircle className="h-3.5 w-3.5" /> },
  { value: "IMPROVE", label: "Improve", icon: <Wand2 className="h-3.5 w-3.5" /> },
  { value: "FIX_GRAMMAR", label: "Fix Grammar", icon: <SpellCheck2 className="h-3.5 w-3.5" /> },
  { value: "SHORTEN", label: "Shorten", icon: <Scissors className="h-3.5 w-3.5" /> },
  { value: "EXPAND", label: "Expand", icon: <Maximize2 className="h-3.5 w-3.5" /> },
];

interface ManualQuestion {
  prompt: string;
  options: string;
  answer: string;
}

const emptyQuestion: ManualQuestion = { prompt: "", options: "", answer: "" };

export default function CreateModeTab() {
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<string[]>([""]);
  const [questions, setQuestions] = useState<ManualQuestion[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [assistLoadingIdx, setAssistLoadingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createPassage = useCreatePassage();
  const updatePassage = useUpdatePassage();
  const writingAssist = useWritingAssist();
  const { data: saved } = usePassage(savedId ?? undefined);

  function updateBlock(i: number, value: string) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? value : b)));
  }

  function addBlock(afterIdx: number) {
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(afterIdx + 1, 0, "");
      return next;
    });
  }

  function removeBlock(i: number) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function runAssist(i: number, instruction: Instruction) {
    const paragraph = blocks[i];
    if (!paragraph.trim()) return;
    setAssistLoadingIdx(i);
    writingAssist.mutate(
      { paragraph, instruction },
      {
        onSuccess: (data) => {
          setAssistLoadingIdx(null);
          if (data.text) {
            updateBlock(i, instruction === "CONTINUE" ? `${paragraph} ${data.text}` : data.text);
          }
        },
        onError: () => setAssistLoadingIdx(null),
      }
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { ...emptyQuestion }]);
  }

  function updateQuestion(i: number, patch: Partial<ManualQuestion>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function buildQuestionsPayload() {
    return questions
      .filter((q) => q.prompt.trim() && q.answer.trim())
      .map((q) => ({
        type: q.options.trim() ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        skill: "Reading Comprehension",
        prompt: q.prompt.trim(),
        options: q.options
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
        answer: q.answer.trim(),
      }));
  }

  function buildContent() {
    return blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
  }

  function saveDraft() {
    setError(null);
    const content = buildContent();
    if (!title.trim()) return setError("กรุณาใส่ชื่อบทความ");
    if (!content) return setError("กรุณาใส่เนื้อหาอย่างน้อย 1 ย่อหน้า");
    const payload = { title: title.trim(), content, category: "My Passage", questions: buildQuestionsPayload() };
    if (savedId) {
      updatePassage.mutate({ id: savedId, ...payload });
    } else {
      createPassage.mutate(payload, { onSuccess: (data) => setSavedId(data.id) });
    }
  }

  const isSaving = createPassage.isPending || updatePassage.isPending;

  if (savedId && saved) {
    return (
      <PublishedView
        title={saved.title}
        visibility={saved.visibility}
        onUpdateVisibility={(visibility) => updatePassage.mutate({ id: savedId, visibility })}
        onEditMore={() => { /* stay on this screen; user can scroll to editor below */ }}
        onSaveChanges={saveDraft}
        isSaving={isSaving}
      >
        <Editor
          title={title} setTitle={setTitle}
          blocks={blocks} updateBlock={updateBlock} addBlock={addBlock} removeBlock={removeBlock}
          runAssist={runAssist} assistLoadingIdx={assistLoadingIdx}
          questions={questions} addQuestion={addQuestion} updateQuestion={updateQuestion} removeQuestion={removeQuestion}
        />
      </PublishedView>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Create your own reading passage</h2>
        <p className="text-sm text-muted-foreground">เขียนบทความของคุณเอง ใช้ AI ช่วยแก้ไข แล้วเผยแพร่ให้คนอื่นอ่านได้</p>
      </div>

      <Editor
        title={title} setTitle={setTitle}
        blocks={blocks} updateBlock={updateBlock} addBlock={addBlock} removeBlock={removeBlock}
        runAssist={runAssist} assistLoadingIdx={assistLoadingIdx}
        questions={questions} addQuestion={addQuestion} updateQuestion={updateQuestion} removeQuestion={removeQuestion}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full gap-2" onClick={saveDraft} disabled={isSaving}>
        <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Draft"}
      </Button>
    </div>
  );
}

function Editor({
  title, setTitle, blocks, updateBlock, addBlock, removeBlock, runAssist, assistLoadingIdx,
  questions, addQuestion, updateQuestion, removeQuestion,
}: {
  title: string;
  setTitle: (v: string) => void;
  blocks: string[];
  updateBlock: (i: number, v: string) => void;
  addBlock: (afterIdx: number) => void;
  removeBlock: (i: number) => void;
  runAssist: (i: number, instruction: Instruction) => void;
  assistLoadingIdx: number | null;
  questions: ManualQuestion[];
  addQuestion: () => void;
  updateQuestion: (i: number, patch: Partial<ManualQuestion>) => void;
  removeQuestion: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อบทความของคุณ..." />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Paragraph {i + 1}</p>
                <div className="flex items-center gap-1">
                  {blocks.length > 1 && (
                    <button onClick={() => removeBlock(i)} className="text-muted-foreground hover:text-destructive" title="Remove paragraph">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <textarea
                className="h-28 w-full rounded-md border p-3 text-sm"
                placeholder="เขียนย่อหน้านี้..."
                value={block}
                onChange={(e) => updateBlock(i, e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {ASSIST_ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => runAssist(i, a.value)}
                    disabled={assistLoadingIdx === i || !block.trim()}
                    className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
                {assistLoadingIdx === i && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3 animate-pulse" /> AI กำลังช่วย...</span>}
              </div>
            </CardContent>
            <button
              onClick={() => addBlock(i)}
              className="flex w-full items-center justify-center gap-1.5 border-t py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Add paragraph
            </button>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Questions (optional)</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addQuestion}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {questions.length === 0 && <p className="text-xs text-muted-foreground">เพิ่มคำถามให้ผู้อ่านตอบหลังอ่านจบ (ไม่บังคับ)</p>}
          {questions.map((q, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Question {i + 1}</p>
                <button onClick={() => removeQuestion(i)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })} placeholder="คำถาม..." />
              <Input value={q.options} onChange={(e) => updateQuestion(i, { options: e.target.value })} placeholder="ตัวเลือก คั่นด้วยจุลภาค (ไม่บังคับ)" />
              <Input value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} placeholder="คำตอบที่ถูกต้อง" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PublishedView({
  title, visibility, onUpdateVisibility, onSaveChanges, isSaving, children,
}: {
  title: string;
  visibility: string;
  onUpdateVisibility: (v: string) => void;
  onEditMore: () => void;
  onSaveChanges: () => void;
  isSaving: boolean;
  children: React.ReactNode;
}) {
  const options = [
    { value: "PRIVATE", label: "Private" },
    { value: "UNLISTED", label: "Unlisted" },
    { value: "PUBLIC", label: "Public" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Draft saved: {title}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Share2 className="h-4 w-4" /> Visibility
            </div>
            <div className="flex gap-1.5">
              {options.map((o) => (
                <button
                  key={o.value}
                  onClick={() => onUpdateVisibility(o.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    visibility === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {visibility === "PUBLIC" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" /> บทความนี้จะปรากฏในแท็บ Community ให้ทุกคนอ่านได้
            </p>
          )}
        </CardContent>
      </Card>

      {children}

      <Button className="w-full gap-2" onClick={onSaveChanges} disabled={isSaving}>
        <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
