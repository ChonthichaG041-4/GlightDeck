// Import Book/Reading (OCR): a guided 5-step wizard, opened from the Content
// Source card in CreateModeTab instead of an inline "coming soon" panel.
//
//   1. Upload         - drag & drop / browse one or more page photos.
//   2. Review Pages   - reorder / rotate / remove pages before spending an AI call.
//   3. AI Processing  - one multimodal Gemini call (see POST /reading/import/book)
//                       with a simulated step-by-step status list layered on top,
//                       since the real call is a single request/response.
//   4. Review Results - edit the extracted title/level/instruction/passage/
//                       questions before saving (reuses QuestionBuilder).
//   5. Save           - collection/tags/visibility, then Save or Save & Open.
//
// This is a fully self-contained creation flow - it creates its OWN passage via
// useCreatePassage rather than feeding into whatever the surrounding Create Mode
// composer currently has loaded, so importing a book never clobbers an
// in-progress manual draft. "Save & Open" jumps straight into the same
// ReadingWorkspace every other passage uses (GET /reading/passages/:id via the
// existing /reading/:id route), so the imported exercise is immediately usable.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud, ImagePlus, RotateCw, Trash2, ArrowUp, ArrowDown, Loader2,
  CheckCircle2, Circle, Plus, X, ChevronRight, ChevronLeft, FileImage,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import QuestionBuilder from "./QuestionBuilder";
import { useImportBook, useCreatePassage, useUpdatePassage, type ImportedBookDocument, type ReadingQuestion } from "@/api/hooks";

type Step = "upload" | "review-pages" | "processing" | "review-results" | "save";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review-pages", label: "Review Pages" },
  { key: "processing", label: "AI Processing" },
  { key: "review-results", label: "Review Results" },
  { key: "save", label: "Save" },
];

interface PageItem {
  id: string;
  file: File;
  previewUrl: string;
  rotation: 0 | 90 | 180 | 270;
}

const PROCESSING_PHASES = [
  "Uploading pages...",
  "Enhancing image quality...",
  "Reading text from images...",
  "Understanding document layout...",
  "Extracting the reading passage...",
  "Finding questions and answer areas...",
  "Identifying question types...",
  "Building a structured reading exercise...",
  "Preparing everything for your review...",
];

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple Choice", TRUE_FALSE: "True / False", YES_NO_NOTGIVEN: "Yes / No / Not Given",
  FILL_BLANK: "Fill in the Blank", SHORT_ANSWER: "Short Answer", ESSAY: "Essay", MATCHING: "Matching", ORDERING: "Ordering",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function ImportBookWizard({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string, title: string) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [processError, setProcessError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedBookDocument | null>(null);

  // Step 4 - Review Results (editable)
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [instruction, setInstruction] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);

  // Step 5 - Save
  const [collection, setCollection] = useState("Reading Practice");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "UNLISTED" | "PUBLIC">("PRIVATE");
  const [saveError, setSaveError] = useState<string | null>(null);

  const importBook = useImportBook();
  const createPassage = useCreatePassage();
  const updatePassage = useUpdatePassage();
  const browseInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function resetAll() {
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setStep("upload");
    setPages([]);
    setPhaseIndex(0);
    setProcessError(null);
    setResult(null);
    setTitle(""); setLevel(""); setInstruction(""); setParagraphs([]); setQuestions([]);
    setCollection("Reading Practice"); setTags([]); setTagDraft(""); setVisibility("PRIVATE"); setSaveError(null);
  }

  function handleClose() {
    onOpenChange(false);
    // Delay the reset so the dialog's own close animation doesn't visibly flash blank content.
    setTimeout(resetAll, 200);
  }

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const items: PageItem[] = files.map((f) => ({ id: `${randomId()}`, file: f, previewUrl: URL.createObjectURL(f), rotation: 0 }));
    setPages((prev) => [...prev, ...items]);
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function movePage(index: number, dir: -1 | 1) {
    setPages((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function rotatePage(id: string) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, rotation: (((p.rotation + 90) % 360) as PageItem["rotation"]) } : p)));
  }

  // Actually rotates the image's pixels via canvas so the uploaded file matches what the user
  // sees in the preview - otherwise Gemini would still read the original, unrotated photo.
  async function rotateFileIfNeeded(page: PageItem): Promise<File> {
    if (page.rotation === 0) return page.file;
    const img = await loadImage(page.previewUrl);
    const swap = page.rotation === 90 || page.rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return page.file;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((page.rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    const type = page.file.type || "image/jpeg";
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) return page.file;
    return new File([blob], page.file.name, { type });
  }

  async function startProcessing() {
    setStep("processing");
    setPhaseIndex(0);
    setProcessError(null);

    const timer = setInterval(() => {
      setPhaseIndex((i) => (i < PROCESSING_PHASES.length - 2 ? i + 1 : i));
    }, 1800);

    try {
      const orderedFiles = await Promise.all(pages.map(rotateFileIfNeeded));
      const data = await importBook.mutateAsync(orderedFiles);
      clearInterval(timer);
      setPhaseIndex(PROCESSING_PHASES.length - 1);
      setResult(data);
      setTitle(data.title);
      setLevel(data.level ?? "");
      setInstruction(data.instruction ?? "");
      setParagraphs(data.blocks.filter((b) => b.type === "PARAGRAPH").map((b: any) => b.text as string));
      setQuestions(data.questions);
      setTimeout(() => setStep("review-results"), 400);
    } catch (err: any) {
      clearInterval(timer);
      setProcessError(err?.response?.data?.error ?? "นำเข้าภาพไม่สำเร็จ ลองใหม่อีกครั้ง");
      setStep("review-pages");
    }
  }

  function updateParagraph(idx: number, text: string) {
    setParagraphs((prev) => prev.map((p, i) => (i === idx ? text : p)));
  }
  function removeParagraph(idx: number) {
    setParagraphs((prev) => prev.filter((_, i) => i !== idx));
  }
  function addParagraph() {
    setParagraphs((prev) => [...prev, ""]);
  }

  function addTag() {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  async function handleSave(openAfter: boolean) {
    setSaveError(null);
    if (!title.trim()) return setSaveError("กรุณาใส่ชื่อบทความ");
    const cleanParagraphs = paragraphs.map((p) => p.trim()).filter(Boolean);
    if (!cleanParagraphs.length) return setSaveError("ไม่มีเนื้อหาบทความ");

    const blocks = cleanParagraphs.map((p) => ({ id: randomId(), type: "PARAGRAPH" as const, text: p }));

    try {
      const created = await createPassage.mutateAsync({
        title: title.trim(),
        description: instruction.trim() || undefined,
        category: collection.trim() || "Reading Practice",
        tags,
        blocks,
        contentSource: "IMPORT_BOOK",
        cefrLevel: level.trim() || undefined,
        testMode: questions.length ? "QUESTIONS" : "READING_ONLY",
        questions,
      });
      if (visibility !== "PRIVATE") {
        await updatePassage.mutateAsync({ id: created.id, visibility });
      }
      if (openAfter) {
        handleClose();
        navigate(`/reading/${created.id}`);
      } else {
        onSaved?.(created.id, title.trim());
        handleClose();
      }
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  const isSaving = createPassage.isPending || updatePassage.isPending;
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <StepIndicator currentIndex={stepIndex} />

        {step === "upload" && (
          <UploadStep
            pages={pages}
            dragOver={dragOver}
            setDragOver={setDragOver}
            addFiles={addFiles}
            browseInputRef={browseInputRef}
            onContinue={() => pages.length && setStep("review-pages")}
          />
        )}

        {step === "review-pages" && (
          <ReviewPagesStep
            pages={pages}
            processError={processError}
            onRemove={removePage}
            onMove={movePage}
            onRotate={rotatePage}
            onAddMore={() => addMoreInputRef.current?.click()}
            addMoreInputRef={addMoreInputRef}
            addFiles={addFiles}
            onBack={() => setStep("upload")}
            onProcess={startProcessing}
          />
        )}

        {step === "processing" && <ProcessingStep phaseIndex={phaseIndex} />}

        {step === "review-results" && (
          <ReviewResultsStep
            title={title} setTitle={setTitle}
            level={level} setLevel={setLevel}
            instruction={instruction} setInstruction={setInstruction}
            paragraphs={paragraphs} onUpdateParagraph={updateParagraph} onRemoveParagraph={removeParagraph} onAddParagraph={addParagraph}
            questions={questions} setQuestions={setQuestions}
            pagesProcessed={result?.pagesProcessed ?? pages.length}
            confidence={result?.confidence ?? null}
            onBack={() => setStep("review-pages")}
            onContinue={() => setStep("save")}
          />
        )}

        {step === "save" && (
          <SaveStep
            pagesProcessed={result?.pagesProcessed ?? pages.length}
            questionsCount={questions.length}
            collection={collection} setCollection={setCollection}
            tags={tags} setTags={setTags} tagDraft={tagDraft} setTagDraft={setTagDraft} onAddTag={addTag}
            visibility={visibility} setVisibility={setVisibility}
            saveError={saveError}
            isSaving={isSaving}
            onBack={() => setStep("review-results")}
            onSave={() => handleSave(false)}
            onSaveAndOpen={() => handleSave(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="mb-4 flex items-center gap-1.5">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-1.5">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              i < currentIndex ? "bg-primary/20 text-primary" : i === currentIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {i < currentIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1 rounded", i < currentIndex ? "bg-primary/40" : "bg-muted")} />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 - Upload Images
// ---------------------------------------------------------------------------
function UploadStep({
  pages, dragOver, setDragOver, addFiles, browseInputRef, onContinue,
}: {
  pages: PageItem[];
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  addFiles: (files: FileList | File[] | null) => void;
  browseInputRef: React.RefObject<HTMLInputElement>;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Import Reading from Images</h3>
        <p className="text-sm text-muted-foreground">
          Upload one or more photos or scanned pages. We'll automatically combine them into a single
          reading exercise and extract the passage, questions, and answers.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => browseInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:bg-accent"
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drag & drop images here</p>
        <p className="text-xs text-muted-foreground">or</p>
        <Button type="button" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); browseInputRef.current?.click(); }}>
          Browse Files
        </Button>
        <input
          ref={browseInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {pages.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileImage className="h-3.5 w-3.5" /> {pages.length} page{pages.length > 1 ? "s" : ""} selected
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold text-foreground">Supported</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>JPG</li>
            <li>PNG</li>
            <li>HEIC</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-foreground">Notes</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Upload pages in reading order.</li>
            <li>Multiple pages will be merged automatically.</li>
            <li>You can rearrange pages in the next step.</li>
          </ul>
        </div>
      </div>

      <Button className="w-full gap-1.5" disabled={!pages.length} onClick={onContinue}>
        Continue <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 - Review & Organize Pages
// ---------------------------------------------------------------------------
function ReviewPagesStep({
  pages, processError, onRemove, onMove, onRotate, onAddMore, addMoreInputRef, addFiles, onBack, onProcess,
}: {
  pages: PageItem[];
  processError: string | null;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRotate: (id: string) => void;
  onAddMore: () => void;
  addMoreInputRef: React.RefObject<HTMLInputElement>;
  addFiles: (files: FileList | File[] | null) => void;
  onBack: () => void;
  onProcess: () => void;
}) {
  const estLow = Math.max(15, pages.length * 5);
  const estHigh = Math.max(30, pages.length * 8);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Review & Organize Pages</h3>
        <p className="text-sm text-muted-foreground">Check that your pages are complete and in the correct order before AI processing.</p>
      </div>

      {processError && <p className="text-sm text-destructive">{processError}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pages.map((page, idx) => (
          <div key={page.id} className="space-y-1.5 rounded-lg border p-2">
            <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
              <img
                src={page.previewUrl}
                alt={`Page ${idx + 1}`}
                className="h-full w-full object-cover transition-transform"
                style={{ transform: `rotate(${page.rotation}deg)` }}
              />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{idx + 1}</span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button onClick={() => onMove(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => onMove(idx, 1)} disabled={idx === pages.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => onRotate(page.id)} className="text-muted-foreground hover:text-foreground"><RotateCw className="h-3.5 w-3.5" /></button>
              <button onClick={() => onRemove(page.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}

        <button
          onClick={onAddMore}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-muted-foreground hover:bg-accent"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-xs">Add more</span>
        </button>
        <input ref={addMoreInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      <div className="rounded-lg border bg-accent/40 p-3 text-sm">
        <p className="font-medium">{pages.length} Page{pages.length !== 1 ? "s" : ""} Selected</p>
        <p className="text-xs text-muted-foreground">Estimated Reading Exercises: 1</p>
        <p className="text-xs text-muted-foreground">Estimated Processing Time: {estLow}–{estHigh} seconds</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</Button>
        <Button className="flex-1 gap-1.5" disabled={!pages.length} onClick={onProcess}>Process with AI <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 - AI Processing
// ---------------------------------------------------------------------------
function ProcessingStep({ phaseIndex }: { phaseIndex: number }) {
  return (
    <div className="space-y-4 py-2">
      <div className="text-center">
        <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
        <h3 className="text-base font-semibold">AI is Processing Your Document</h3>
        <p className="text-sm text-muted-foreground">Please wait while AI analyzes your document and converts it into a structured reading exercise.</p>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        {PROCESSING_PHASES.map((phase, i) => (
          <div key={phase} className={cn("flex items-center gap-2 text-sm", i > phaseIndex && "text-muted-foreground")}>
            {i < phaseIndex ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : i === phaseIndex ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            )}
            <span className={i === phaseIndex ? "font-medium" : ""}>{phase}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">This usually takes less than a minute.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 - Review Extracted Content
// ---------------------------------------------------------------------------
function ReviewResultsStep({
  title, setTitle, level, setLevel, instruction, setInstruction,
  paragraphs, onUpdateParagraph, onRemoveParagraph, onAddParagraph,
  questions, setQuestions, pagesProcessed, confidence, onBack, onContinue,
}: {
  title: string; setTitle: (v: string) => void;
  level: string; setLevel: (v: string) => void;
  instruction: string; setInstruction: (v: string) => void;
  paragraphs: string[]; onUpdateParagraph: (i: number, v: string) => void; onRemoveParagraph: (i: number) => void; onAddParagraph: () => void;
  questions: ReadingQuestion[]; setQuestions: (q: ReadingQuestion[]) => void;
  pagesProcessed: number; confidence: number | null;
  onBack: () => void; onContinue: () => void;
}) {
  const typeLabels = Array.from(new Set(questions.map((q) => QUESTION_TYPE_LABELS[q.type] ?? q.type)));
  const canContinue = title.trim().length > 0 && paragraphs.some((p) => p.trim());

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Review Extracted Content</h3>
        <p className="text-sm text-muted-foreground">AI has finished processing your document. Review and edit the extracted content before saving.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-accent/40 p-3 text-xs sm:grid-cols-4">
        <Stat label="Pages Processed" value={String(pagesProcessed)} />
        <Stat label="Passage" value="1" />
        <Stat label="Questions" value={String(questions.length)} />
        <Stat label="AI Confidence" value={confidence != null ? `${confidence}%` : "—"} />
        {typeLabels.length > 0 && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-muted-foreground">Question Types</p>
            <p className="font-medium">{typeLabels.join(", ")}</p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Exercise Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exercise title" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Reading Level (optional)</Label>
        <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. B1, Level 3" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Instructions</Label>
        <textarea
          className="h-16 w-full rounded-md border p-2 text-sm"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Read the following passage."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Passage</Label>
        {paragraphs.map((p, i) => (
          <div key={i} className="flex gap-2">
            <textarea
              className="h-20 flex-1 rounded-md border p-2 text-sm"
              value={p}
              onChange={(e) => onUpdateParagraph(i, e.target.value)}
            />
            <button onClick={() => onRemoveParagraph(i)} className="self-start text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onAddParagraph}><Plus className="h-3.5 w-3.5" /> Paragraph</Button>
      </div>

      <QuestionBuilder questions={questions} onChange={setQuestions} />

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</Button>
        <Button className="flex-1 gap-1.5" disabled={!canContinue} onClick={onContinue}>Save Exercise <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 - Save Exercise
// ---------------------------------------------------------------------------
function SaveStep({
  pagesProcessed, questionsCount, collection, setCollection, tags, setTags, tagDraft, setTagDraft, onAddTag,
  visibility, setVisibility, saveError, isSaving, onBack, onSave, onSaveAndOpen,
}: {
  pagesProcessed: number;
  questionsCount: number;
  collection: string; setCollection: (v: string) => void;
  tags: string[]; setTags: (t: string[]) => void;
  tagDraft: string; setTagDraft: (v: string) => void; onAddTag: () => void;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC"; setVisibility: (v: "PRIVATE" | "UNLISTED" | "PUBLIC") => void;
  saveError: string | null;
  isSaving: boolean;
  onBack: () => void;
  onSave: () => void;
  onSaveAndOpen: () => void;
}) {
  const visibilityOptions: { value: "PRIVATE" | "UNLISTED" | "PUBLIC"; label: string }[] = [
    { value: "PRIVATE", label: "Private" },
    { value: "UNLISTED", label: "Unlisted" },
    { value: "PUBLIC", label: "Public" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Ready to Save</h3>
        <p className="text-sm text-muted-foreground">Everything looks good. Choose where you'd like to save this reading exercise.</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Collection</Label>
        <Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="Reading Practice" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tags</Label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
              {t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            className="min-w-[80px] flex-1 border-0 bg-transparent text-xs outline-none"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); onAddTag(); } }}
            placeholder={tags.length ? "" : "Type and press Enter..."}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Visibility</Label>
        <div className="flex gap-1.5">
          {visibilityOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => setVisibility(o.value)}
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

      <div className="space-y-1 rounded-lg border bg-accent/40 p-3 text-sm">
        <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {pagesProcessed} Page{pagesProcessed !== 1 ? "s" : ""} Imported</p>
        <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 1 Passage</p>
        <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {questionsCount} Question{questionsCount !== 1 ? "s" : ""}</p>
        <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Structured Successfully</p>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="gap-1.5" onClick={onBack} disabled={isSaving}><ChevronLeft className="h-4 w-4" /> Back</Button>
        <Button variant="outline" className="flex-1" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</Button>
        <Button className="flex-1" onClick={onSaveAndOpen} disabled={isSaving}>{isSaving ? "Saving..." : "Save & Open"}</Button>
      </div>
    </div>
  );
}
