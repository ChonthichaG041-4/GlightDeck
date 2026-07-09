// Create tab: unified composer - Title/Description/Category/Tags/Difficulty/Test
// Mode (shared with the Generate tab via PassageMetaFields) + Content Source +
// rich Block Editor + Question Builder + Vocabulary panel + AI Assistant +
// Preview (reuses ReadingWorkspace, same as the Generate tab).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Save, Share2, CheckCircle2, ExternalLink, Lock, Eye, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useCreatePassage, useUpdatePassage, usePassage,
  useImportDocx, useImportPdf, useImportMarkdown,
  type Block, type ContentSource, type ReadingQuestion, type VocabularyItem, type ImportedDocument,
} from "@/api/hooks";
import ReadingWorkspace from "./ReadingWorkspace";
import PassageMetaFields, { type PassageMeta } from "./PassageMetaFields";
import BlockEditor from "./BlockEditor";
import QuestionBuilder from "./QuestionBuilder";
import VocabularyPanel from "./VocabularyPanel";
import AiAssistantToolbar from "./AiAssistantToolbar";
import ImportBookWizard from "./ImportBookWizard";
import { FieldLabel, OptionCard } from "./primitives";
import { CONTENT_SOURCES } from "./composerConstants";
import { blocksToPlainText, plainTextToBlocks } from "@/lib/blocksToText";
import { cn } from "@/lib/utils";

const emptyMeta: PassageMeta = { title: "", description: "", category: "My Passage", tags: [], cefrLevel: "AUTO", testMode: "QUESTIONS" };

export default function CreateModeTab({ editArticleId }: { editArticleId?: string } = {}) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<PassageMeta>(emptyMeta);
  const [contentSource, setContentSource] = useState<ContentSource>("WRITE_MANUALLY");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [markdownText, setMarkdownText] = useState("");
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);
  const [vocabularyMode, setVocabularyMode] = useState<"AUTO" | "MANUAL" | "NONE">("NONE");
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [translation, setTranslation] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [bookWizardOpen, setBookWizardOpen] = useState(false);
  const [bookImportSuccess, setBookImportSuccess] = useState<{ id: string; title: string } | null>(null);
  // Loading an existing article to edit is async (usePassage) - track whether
  // we've already copied its data into the form state, so we don't re-hydrate
  // (and stomp on the user's in-progress edits) on every re-render.
  const [hydratedFrom, setHydratedFrom] = useState<string | null>(null);

  const createPassage = useCreatePassage();
  const updatePassage = useUpdatePassage();
  const importDocx = useImportDocx();
  const importPdf = useImportPdf();
  const importMarkdown = useImportMarkdown();
  const { data: saved } = usePassage(savedId ?? editArticleId ?? undefined);

  useEffect(() => {
    if (!editArticleId || !saved || hydratedFrom === editArticleId) return;
    if (saved.isOwner === false) {
      setError("คุณไม่มีสิทธิ์แก้ไขบทความนี้ (เฉพาะผู้สร้างเท่านั้นที่แก้ไขได้)");
      setHydratedFrom(editArticleId);
      return;
    }
    setSavedId(saved.id);
    setMeta({
      title: saved.title,
      description: saved.description ?? "",
      category: saved.category,
      tags: saved.tags ?? [],
      cefrLevel: saved.cefrLevel ?? "AUTO",
      testMode: saved.testMode ?? "QUESTIONS",
    });
    setContentSource((saved.contentSource as ContentSource) || "WRITE_MANUALLY");
    setBlocks(saved.blocks ?? []);
    setQuestions(saved.questions ?? []);
    setVocabularyMode((saved.vocabularyMode as "AUTO" | "MANUAL" | "NONE") || "NONE");
    setVocabulary(saved.vocabulary ?? []);
    setTranslation(saved.translation ?? "");
    setHydratedFrom(editArticleId);
  }, [editArticleId, saved, hydratedFrom]);

  const passage = useMemo(() => blocksToPlainText(blocks), [blocks]);
  const selectedBlockText = useMemo(() => {
    const b = blocks.find((x) => x.id === selectedBlockId);
    if (!b) return null;
    if (b.type === "HEADING" || b.type === "PARAGRAPH" || b.type === "QUOTE") return b.text;
    return null;
  }, [blocks, selectedBlockId]);

  function updateMeta(patch: Partial<PassageMeta>) {
    setMeta((m) => ({ ...m, ...patch }));
  }

  function applyImportedBlocks(imported: ImportedDocument) {
    setBlocks(imported.blocks);
    if (imported.title && !meta.title.trim()) updateMeta({ title: imported.title });
    setImportError(null);
  }

  function handleFileImport(file: File, kind: "docx" | "pdf") {
    setImportError(null);
    const mutation = kind === "docx" ? importDocx : importPdf;
    mutation.mutate(file, {
      onSuccess: (data) => applyImportedBlocks(data),
      onError: () => setImportError("นำเข้าไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"),
    });
  }

  function convertPasteText() {
    if (!pasteText.trim()) return;
    setBlocks(plainTextToBlocks(pasteText));
    setImportError(null);
  }

  function convertMarkdown() {
    if (!markdownText.trim()) return;
    setImportError(null);
    importMarkdown.mutate(markdownText, {
      onSuccess: (data) => applyImportedBlocks(data),
      onError: () => setImportError("แปลง Markdown ไม่สำเร็จ ลองใหม่อีกครั้ง"),
    });
  }

  function applyToSelectedBlock(text: string) {
    if (!selectedBlockId) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === selectedBlockId && (b.type === "HEADING" || b.type === "PARAGRAPH" || b.type === "QUOTE") ? { ...b, text } : b
      )
    );
  }

  function buildPayload() {
    return {
      title: meta.title.trim(),
      description: meta.description.trim() || undefined,
      category: meta.category.trim() || "My Passage",
      tags: meta.tags,
      blocks,
      content: passage,
      translation: translation.trim() || undefined,
      contentSource,
      cefrLevel: meta.cefrLevel,
      testMode: meta.testMode,
      vocabularyMode,
      vocabulary,
      questions,
    };
  }

  function save(onDone?: () => void) {
    setError(null);
    if (!meta.title.trim()) return setError("กรุณาใส่ชื่อบทความ");
    if (!passage.trim()) return setError("กรุณาใส่เนื้อหาอย่างน้อย 1 บล็อก");
    const payload = buildPayload();
    if (savedId) {
      updatePassage.mutate({ id: savedId, ...payload }, { onSuccess: () => onDone?.() });
    } else {
      createPassage.mutate(payload, { onSuccess: (data) => { setSavedId(data.id); onDone?.(); } });
    }
  }

  const isSaving = createPassage.isPending || updatePassage.isPending;

  function openPreview() {
    save(() => setMode("preview"));
  }

  if (mode === "preview" && savedId) {
    return (
      <ReadingWorkspace
        articleId={savedId}
        title={meta.title}
        passage={passage}
        translation={translation || undefined}
        questions={questions.length ? questions : undefined}
        testMode={meta.testMode}
        metaLine={`${meta.cefrLevel} - Preview`}
        onBack={() => setMode("edit")}
      />
    );
  }

  // Editing an existing article: block the form entirely for non-owners
  // instead of letting them see/fill it out and only fail on save.
  if (editArticleId && hydratedFrom === editArticleId && saved?.isOwner === false) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <p className="font-semibold text-destructive">ไม่มีสิทธิ์แก้ไข</p>
            <p className="text-sm text-muted-foreground">คุณไม่ใช่ผู้สร้างบทความนี้ จึงไม่สามารถแก้ไขได้</p>
            <Button asChild variant="outline" className="mt-2">
              <Link to={`/reading/${editArticleId}`}>กลับไปอ่านบทความ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (editArticleId && hydratedFrom !== editArticleId) {
    return <p className="p-6 text-center text-sm text-muted-foreground">กำลังโหลดบทความ...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{editArticleId ? "Edit your reading passage" : "Create your own reading passage"}</h2>
        <p className="text-sm text-muted-foreground">เขียนบทความของคุณเอง ใช้ AI ช่วยแก้ไข แล้วเผยแพร่ให้คนอื่นอ่านได้</p>
      </div>

      {savedId && saved && (
        <VisibilityCard
          title={saved.title}
          visibility={saved.visibility}
          onUpdateVisibility={(visibility) => updatePassage.mutate({ id: savedId, visibility })}
        />
      )}

      <Card>
        <CardContent className="p-5">
          <PassageMetaFields meta={meta} onChange={updateMeta} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <FieldLabel text="Content Source" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CONTENT_SOURCES.map((s) => (
              <OptionCard
                key={s.value}
                active={contentSource === s.value}
                onClick={() => {
                  if (!s.enabled) return;
                  setContentSource(s.value as ContentSource);
                  if (s.value === "IMPORT_BOOK") setBookWizardOpen(true);
                }}
                icon={<s.icon className="h-5 w-5" />}
                title={s.title}
                description={s.description}
                disabled={!s.enabled}
                badge={!s.enabled ? <Lock className="h-3 w-3" /> : undefined}
              />
            ))}
          </div>

          {contentSource === "PASTE_TEXT" && (
            <div className="space-y-2">
              <textarea
                className="h-32 w-full rounded-md border p-2 text-sm"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="วางข้อความที่มีอยู่แล้วที่นี่..."
              />
              <Button size="sm" variant="outline" onClick={convertPasteText}>Convert to Blocks</Button>
            </div>
          )}
          {contentSource === "IMPORT_DOCX" && (
            <div className="space-y-2">
              <input type="file" accept=".docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f, "docx"); }} className="text-xs" />
              {importDocx.isPending && <p className="text-xs text-muted-foreground">กำลังนำเข้า...</p>}
            </div>
          )}
          {contentSource === "IMPORT_PDF" && (
            <div className="space-y-2">
              <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f, "pdf"); }} className="text-xs" />
              {importPdf.isPending && <p className="text-xs text-muted-foreground">กำลังนำเข้า...</p>}
            </div>
          )}
          {contentSource === "IMPORT_MARKDOWN" && (
            <div className="space-y-2">
              <textarea
                className="h-32 w-full rounded-md border p-2 font-mono text-xs"
                value={markdownText}
                onChange={(e) => setMarkdownText(e.target.value)}
                placeholder="# หัวข้อ..."
              />
              <Button size="sm" variant="outline" onClick={convertMarkdown} disabled={importMarkdown.isPending}>
                {importMarkdown.isPending ? "Converting..." : "Convert Markdown"}
              </Button>
            </div>
          )}
          {contentSource === "IMPORT_BOOK" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                นำเข้าจากภาพข้อสอบ/หนังสือ - อัปโหลดรูปหลายหน้า แล้ว AI จะแยกบทความและคำถามให้ผ่านตัวช่วยนำเข้าแบบเป็นขั้นตอน
                (สร้างเป็นบทความใหม่แยกต่างหาก ไม่กระทบฉบับร่างที่กำลังแก้ไขอยู่นี้)
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBookWizardOpen(true)}>
                <Sparkles className="h-3.5 w-3.5" /> Open Import Wizard
              </Button>
              {bookImportSuccess && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> นำเข้าและบันทึกสำเร็จ: {bookImportSuccess.title}{" "}
                  <Link to={`/reading/${bookImportSuccess.id}`} className="underline">เปิดดู</Link>
                </p>
              )}
            </div>
          )}
          {importError && <p className="text-xs text-destructive">{importError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <FieldLabel text="Editor" />
          <BlockEditor blocks={blocks} onChange={setBlocks} selectedId={selectedBlockId} onSelect={setSelectedBlockId} />
        </CardContent>
      </Card>

      <QuestionBuilder questions={questions} onChange={setQuestions} />

      <VocabularyPanel
        mode={vocabularyMode}
        vocabulary={vocabulary}
        passage={passage}
        onChange={(patch) => {
          if (patch.mode) setVocabularyMode(patch.mode);
          if (patch.vocabulary) setVocabulary(patch.vocabulary);
        }}
      />

      <AiAssistantToolbar
        passage={passage}
        selectedBlockText={selectedBlockText}
        onApplyToSelectedBlock={applyToSelectedBlock}
        onQuestionsGenerated={setQuestions}
        onVocabularyGenerated={(v) => { setVocabulary(v); setVocabularyMode("MANUAL"); }}
        onSummaryGenerated={(s) => updateMeta({ description: s })}
        onTranslationGenerated={setTranslation}
      />

      {translation && (
        <Card>
          <CardContent className="space-y-1.5 p-4">
            <FieldLabel text="Translation" />
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{translation}</p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button className="flex-1 gap-2" variant="outline" onClick={openPreview} disabled={isSaving}>
          <Eye className="h-4 w-4" /> Preview
        </Button>
        <Button
          className="flex-1 gap-2"
          onClick={() => {
            // After editing an existing article, go back to whichever My
            // Articles list it belongs to (Reading vs. Listening are the same
            // Article table, told apart by category).
            const editDestination = saved?.category === "Listening" ? "/listening?tab=library" : "/reading?tab=library";
            save(editArticleId ? () => navigate(editDestination) : undefined);
          }}
          disabled={isSaving}
        >
          <Save className="h-4 w-4" /> {isSaving ? "Saving..." : savedId ? "Save Changes" : "Save Draft"}
        </Button>
      </div>

      <ImportBookWizard
        open={bookWizardOpen}
        onOpenChange={setBookWizardOpen}
        onSaved={(id, savedTitle) => setBookImportSuccess({ id, title: savedTitle })}
      />
    </div>
  );
}

function VisibilityCard({
  title, visibility, onUpdateVisibility,
}: { title: string; visibility: string; onUpdateVisibility: (v: string) => void }) {
  const options = [
    { value: "PRIVATE", label: "Private" },
    { value: "UNLISTED", label: "Unlisted" },
    { value: "PUBLIC", label: "Public" },
  ];
  return (
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
  );
}
