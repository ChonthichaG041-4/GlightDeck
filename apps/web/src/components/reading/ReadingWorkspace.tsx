import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Bookmark, BookmarkCheck, Copy, Highlighter, Languages, BookOpen,
  StickyNote, Plus, Sparkles, CheckCircle2, XCircle, Clock, Percent, ListChecks,
  Globe2, Eye, Heart, Share2, Star, X, Check, Book, Volume2,
  Maximize2, Minimize2, MoreHorizontal, GraduationCap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  usePassage, useCreateHighlight, useDeleteHighlight, useCreateNote, useDeleteNote,
  useToggleBookmark, useUpdatePassage, useExplainSentence, useAiExplain, useCreateWord,
  useSubmitReadingAttempt, useToggleLike, useWordDetail, useWords, useDeleteWord,
  useCollections, useTags, useCreateCollection, useGrammarNotes,
  type ReadingQuestion, type HighlightItem, type WordDetailResult, type GrammarPoint,
} from "@/api/hooks";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

const HIGHLIGHT_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8"];

// Prefer a real recorded pronunciation (from Wiktionary via Kaikki/Free Dictionary API)
// over the browser's synthesized voice, falling back to speak() when unavailable.
function playPronunciation(audioUrl: string | null | undefined, word: string) {
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch(() => speak(word));
  } else {
    speak(word);
  }
}

interface Props {
  articleId: string;
  title: string;
  passage: string;
  translation?: string;
  questions?: ReadingQuestion[] | null;
  testMode: string;
  metaLine?: string;
  onBack: () => void;
  /** Community/browse mode: viewer isn't the owner, show like/publish-state read-only. */
  readOnly?: boolean;
}

function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) break;
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function splitParagraphs(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let offset = 0;
  for (const chunk of text.split(/(\n\s*\n)/)) {
    if (!/^\n\s*\n$/.test(chunk) && chunk.length) out.push({ text: chunk, start: offset });
    offset += chunk.length;
  }
  return out;
}

function getOffsetWithinContainer(container: Node, node: Node, nodeOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) return offset + nodeOffset;
    offset += current.textContent?.length ?? 0;
  }
  return offset;
}

export default function ReadingWorkspace({
  articleId, title, passage, translation, questions, testMode, metaLine, onBack, readOnly,
}: Props) {
  const { data: saved } = usePassage(articleId);
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const toggleBookmark = useToggleBookmark();
  const updatePassage = useUpdatePassage();
  const toggleLike = useToggleLike();
  const explainSentence = useExplainSentence();
  const explainWord = useAiExplain();
  const createWord = useCreateWord();
  const deleteWord = useDeleteWord();
  const submitAttempt = useSubmitReadingAttempt();
  const wordDetail = useWordDetail();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sessionWords, setSessionWords] = useState<{ id: string; headword: string }[]>([]);

  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; text: string; start: number; end: number } | null>(null);
  const [notePrompt, setNotePrompt] = useState<{ start: number; text: string; draft: string } | null>(null);
  const [explainPanel, setExplainPanel] = useState<{ label: string; loading: boolean } | null>(null);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [vocabToast, setVocabToast] = useState<string | null>(null);
  const [bottomHint, setBottomHint] = useState<string | null>(null);

  const wordDetailResult: WordDetailResult | null = wordDetail.data?.result ?? null;

  // Does this word already exist in the user's vocabulary? Only checked while the
  // popup is open, so idle reading never fires an extra request.
  const { data: matchingWords } = useWords({ search: activeWord ?? undefined }, { enabled: !!activeWord });
  const alreadySaved = activeWord
    ? matchingWords?.find((w) => w.headword.toLowerCase() === activeWord.toLowerCase())
    : undefined;

  const [userTranslation, setUserTranslation] = useState("");
  const [translationChecked, setTranslationChecked] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false);
  const [currentQIndex, setCurrentQIndex] = useState(0);

  const showQuestionsBox = (testMode === "QUESTIONS" || testMode === "MIXED") && !!questions?.length;
  const grammarNotes = useGrammarNotes(articleId, passage, testMode === "GRAMMAR");

  useEffect(() => {
    const t = setInterval(() => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    setCurrentQIndex(0);
  }, [articleId]);

  useEffect(() => {
    if (!bottomHint) return;
    const t = setTimeout(() => setBottomHint(null), 2200);
    return () => clearTimeout(t);
  }, [bottomHint]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 100);
  }

  const highlights = saved?.highlights ?? [];

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const start = getOffsetWithinContainer(containerRef.current, range.startContainer, range.startOffset);
    const end = getOffsetWithinContainer(containerRef.current, range.endContainer, range.endOffset);
    const rect = range.getBoundingClientRect();
    setSelectionToolbar({ x: rect.left + rect.width / 2, y: rect.top, text, start: Math.min(start, end), end: Math.max(start, end) });
  }

  function closeToolbar() {
    setSelectionToolbar(null);
    window.getSelection()?.removeAllRanges();
  }

  function doHighlight() {
    if (!selectionToolbar) return;
    const color = HIGHLIGHT_COLORS[highlights.length % HIGHLIGHT_COLORS.length];
    createHighlight.mutate({ articleId, text: selectionToolbar.text, startOffset: selectionToolbar.start, endOffset: selectionToolbar.end, color });
    closeToolbar();
  }

  function doCopy() {
    if (!selectionToolbar) return;
    navigator.clipboard?.writeText(selectionToolbar.text);
    closeToolbar();
  }

  function doTranslateSelection() {
    if (!selectionToolbar) return;
    const label = selectionToolbar.text;
    setExplainPanel({ label, loading: true });
    explainSentence.mutate({ sentence: label, passageContext: passage }, { onSuccess: () => setExplainPanel({ label, loading: false }) });
    closeToolbar();
  }

  function doDictionarySelection() {
    if (!selectionToolbar) return;
    openWordPopup(selectionToolbar.text);
    closeToolbar();
  }

  function doAskAi() {
    doTranslateSelection();
  }

  function doAddNotePrompt() {
    if (!selectionToolbar) return;
    setNotePrompt({ start: selectionToolbar.start, text: selectionToolbar.text, draft: "" });
    closeToolbar();
  }

  function doVocabularySelection() {
    if (!selectionToolbar) return;
    const headword = selectionToolbar.text;
    explainWord.mutate(headword, {
      onSuccess: (data: any) => {
        createWord.mutate(
          { headword, meaning: data?.meaning ?? "" },
          { onSuccess: (created: any) => setSessionWords((prev) => [...prev, { id: created.id, headword: created.headword }]) }
        );
      },
    });
    closeToolbar();
  }

  function saveNote() {
    if (!notePrompt || !notePrompt.draft.trim()) return;
    createNote.mutate({ articleId, text: notePrompt.draft.trim(), anchorText: notePrompt.text, anchorOffset: notePrompt.start });
    setNotePrompt(null);
  }

  function explainSentenceClick(sentenceText: string) {
    setExplainPanel({ label: sentenceText, loading: true });
    explainSentence.mutate({ sentence: sentenceText, passageContext: passage }, { onSuccess: () => setExplainPanel({ label: sentenceText, loading: false }) });
  }

  function onWordDoubleClick(word: string) {
    const clean = word.replace(/[^a-zA-Z'-]/g, "");
    if (!clean) return;
    openWordPopup(clean);
  }

  function openWordPopup(word: string) {
    setActiveWord(word);
    setJustSaved(false);
    setVocabToast(null);
    wordDetail.mutate({ word, sourceLang: "en", targetLang: "th" });
  }

  function closeWordPopup() {
    setActiveWord(null);
    setSaveDialogOpen(false);
    setJustSaved(false);
    setVocabToast(null);
  }

  function paragraphBookmarked(start: number) {
    return highlights && saved?.bookmarks?.some((b) => b.anchorOffset === start);
  }

  function toggleParagraphBookmark(start: number, text: string) {
    toggleBookmark.mutate({ articleId, anchorOffset: start, anchorText: text.slice(0, 60) });
  }

  // ---- render a paragraph: sentence-split, each sentence highlight+word aware ----
  function renderParagraph(paraText: string, paraStart: number, key: number) {
    const sentences = splitSentences(paraText);
    return (
      <div key={key} className="group/para relative py-1 pl-6">
        <button
          type="button"
          className="absolute left-0 top-1.5 opacity-0 transition-opacity group-hover/para:opacity-100"
          onClick={() => toggleParagraphBookmark(paraStart, paraText)}
          title="Bookmark this paragraph"
        >
          {paragraphBookmarked(paraStart) ? (
            <BookmarkCheck className="h-4 w-4 text-primary" />
          ) : (
            <Bookmark className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {sentences.map((s, i) => renderSentence(s.text, paraStart + s.start, paraStart + s.end, `${key}-${i}`))}
      </div>
    );
  }

  function renderSentence(sentenceText: string, absStart: number, absEnd: number, key: string) {
    // Local highlight segments within this sentence's absolute range.
    const points = new Set([absStart, absEnd]);
    highlights.forEach((h: HighlightItem) => {
      if (h.startOffset < absEnd && h.endOffset > absStart) {
        points.add(Math.max(h.startOffset, absStart));
        points.add(Math.min(h.endOffset, absEnd));
      }
    });
    const bounds = Array.from(points).sort((a, b) => a - b);
    const segments: { text: string; color: string | null }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const segStart = bounds[i];
      const segEnd = bounds[i + 1];
      if (segStart >= segEnd) continue;
      const hit = highlights.find((h: HighlightItem) => h.startOffset <= segStart && h.endOffset >= segEnd);
      segments.push({ text: sentenceText.slice(segStart - absStart, segEnd - absStart), color: hit?.color ?? null });
    }

    return (
      <span key={key} className="group/sentence">
        {segments.map((seg, i) => {
          const tokens = seg.text.split(/(\s+)/);
          const body = tokens.map((tok, j) =>
            /^\s+$/.test(tok) ? (
              <span key={j}>{tok}</span>
            ) : (
              <span
                key={j}
                className="cursor-pointer rounded px-0.5 hover:bg-accent hover:text-accent-foreground"
                onDoubleClick={() => onWordDoubleClick(tok)}
              >
                {tok}
              </span>
            )
          );
          return seg.color ? (
            <mark key={i} style={{ backgroundColor: seg.color }} className="rounded px-0.5 text-inherit">
              {body}
            </mark>
          ) : (
            <span key={i}>{body}</span>
          );
        })}
        <button
          type="button"
          className="ml-0.5 inline-flex opacity-0 transition-opacity group-hover/sentence:opacity-100"
          onClick={() => explainSentenceClick(sentenceText.trim())}
          title="AI Explain this sentence"
        >
          <Sparkles className="h-3 w-3 text-primary" />
        </button>
      </span>
    );
  }

  const paragraphs = useMemo(() => splitParagraphs(passage), [passage]);

  function updateAnswer(i: number, value: string) {
    setAnswers((prev) => ({ ...prev, [i]: value }));
  }

  function gradeQuestions(): { correct: number; total: number } {
    const qs = questions ?? [];
    let correct = 0;
    qs.forEach((q, i) => {
      const given = (answers[i] ?? "").trim().toLowerCase();
      const expected = q.answer.trim().toLowerCase();
      const isShortForm = q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER";
      if (given && (given === expected || (isShortForm && given.length > 2 && expected.includes(given)))) correct++;
    });
    return { correct, total: qs.length };
  }

  function checkTranslation() {
    setTranslationChecked(true);
    submitAttempt.mutate({ correctCount: 1, totalCount: 1, articleId });
  }

  // The sidebar Questions box has no separate "Submit" step - once every question
  // has been answered, record the attempt automatically.
  useEffect(() => {
    if (!questions?.length || questionsSubmitted) return;
    if (Object.keys(answers).length >= questions.length) {
      setQuestionsSubmitted(true);
      const { correct, total } = gradeQuestions();
      submitAttempt.mutate({ correctCount: correct, totalCount: total || 1, articleId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, questions, questionsSubmitted]);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 pb-24 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> {readOnly ? "Back" : "New Exercise"}
          </Button>
          {metaLine && <p className="text-xs text-muted-foreground">{metaLine}</p>}
        </div>

        <Card>
          <CardContent className="space-y-1 p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{title}</h2>
              {readOnly && saved ? (
                <Button
                  variant="outline" size="sm" className="shrink-0 gap-1.5"
                  onClick={() => toggleLike.mutate(articleId)}
                >
                  <Heart className={cn("h-4 w-4", saved.stats.liked && "fill-red-500 text-red-500")} />
                  {saved.stats.likes}
                </Button>
              ) : !readOnly ? (
                <VisibilityPills
                  visibility={saved?.visibility}
                  onUpdate={(v) => updatePassage.mutate({ id: articleId, visibility: v })}
                />
              ) : null}
            </div>
            <div
              ref={(el) => {
                containerRef.current = el;
              }}
              onMouseUp={handleMouseUp}
              className="select-text leading-8"
            >
              {paragraphs.map((p, i) => renderParagraph(p.text, p.start, i))}
            </div>
          </CardContent>
        </Card>

        {saved?.notes && saved.notes.length > 0 && (
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-semibold">Your Notes</h2>
              {saved.notes.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div>
                    {n.anchorText && <p className="text-xs italic text-muted-foreground">"{n.anchorText}"</p>}
                    <p>{n.text}</p>
                  </div>
                  <button onClick={() => deleteNote.mutate({ id: n.id, articleId })} className="text-xs text-muted-foreground hover:text-destructive">
                    ✕
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Right sidebar: Reading Progress + mode-specific box ---- */}
      <div className="space-y-3">
        <Card className="lg:sticky lg:top-4">
          <CardContent className="space-y-3 p-4">
            <h2 className="font-semibold">Reading Progress</h2>
            <StatRow icon={<Percent className="h-4 w-4" />} label="Progress" value={`${scrollProgress}%`} />
            <StatRow icon={<Clock className="h-4 w-4" />} label="Reading Time" value={formatTime(elapsedSec)} />
            <StatRow icon={<BookOpen className="h-4 w-4" />} label="Words Saved" value={String(sessionWords.length)} />
            <StatRow icon={<ListChecks className="h-4 w-4" />} label="Questions" value={String(questions?.length ?? 0)} />
            <StatRow icon={<Bookmark className="h-4 w-4" />} label="Bookmarks" value={String(saved?.bookmarks?.length ?? 0)} />
            {readOnly && saved && (
              <>
                <hr />
                <StatRow icon={<Eye className="h-4 w-4" />} label="Views" value={String(saved.stats.views)} />
                <StatRow icon={<Globe2 className="h-4 w-4" />} label="Attempts" value={String(saved.stats.attempts)} />
                {saved.stats.avgScorePercent != null && (
                  <StatRow icon={<CheckCircle2 className="h-4 w-4" />} label="Avg Score" value={`${saved.stats.avgScorePercent}%`} />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {testMode === "TRANSLATION" && (
          <ExpandableSidebarCard title="Translation" icon={<Languages className="h-4 w-4" />}>
            <TranslationBox
              value={userTranslation}
              onChange={setUserTranslation}
              checked={translationChecked}
              onCheck={checkTranslation}
              reference={translation}
            />
          </ExpandableSidebarCard>
        )}

        {showQuestionsBox && (
          <ExpandableSidebarCard
            title="Questions"
            icon={<ListChecks className="h-4 w-4" />}
            headerExtra={<Badge variant="secondary">{Object.keys(answers).length} / {questions!.length}</Badge>}
          >
            <QuestionsBox
              questions={questions!}
              currentIndex={currentQIndex}
              onNavigate={setCurrentQIndex}
              answers={answers}
              onAnswer={updateAnswer}
            />
          </ExpandableSidebarCard>
        )}

        {testMode === "VOCABULARY" && (
          <ExpandableSidebarCard title="Vocabulary" icon={<BookOpen className="h-4 w-4" />} expandable={false}>
            <VocabularyBox
              words={sessionWords}
              onRemove={(id) => {
                deleteWord.mutate(id);
                setSessionWords((prev) => prev.filter((w) => w.id !== id));
              }}
            />
          </ExpandableSidebarCard>
        )}

        {testMode === "GRAMMAR" && (
          <ExpandableSidebarCard title="Grammar Points" icon={<GraduationCap className="h-4 w-4" />} expandable={false}>
            <GrammarBox query={grammarNotes} />
          </ExpandableSidebarCard>
        )}

        {/* Attach the scroll listener to the window since the passage flows in-page. */}
        <ScrollTracker onScroll={onScroll} scrollRef={scrollRef} />
      </div>

      {/* ---- Floating selection toolbar ---- */}
      {selectionToolbar && (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
          style={{ left: selectionToolbar.x, top: selectionToolbar.y - 8 }}
        >
          <ToolbarBtn icon={<Highlighter className="h-3.5 w-3.5" />} label="Highlight" onClick={doHighlight} />
          <ToolbarBtn icon={<Languages className="h-3.5 w-3.5" />} label="Translate" onClick={doTranslateSelection} />
          <ToolbarBtn icon={<BookOpen className="h-3.5 w-3.5" />} label="Dictionary" onClick={doDictionarySelection} />
          <ToolbarBtn icon={<StickyNote className="h-3.5 w-3.5" />} label="Add Note" onClick={doAddNotePrompt} />
          <ToolbarBtn icon={<Copy className="h-3.5 w-3.5" />} label="Copy" onClick={doCopy} />
          <ToolbarBtn icon={<Plus className="h-3.5 w-3.5" />} label="Vocabulary" onClick={doVocabularySelection} />
          <ToolbarBtn icon={<Sparkles className="h-3.5 w-3.5" />} label="Ask AI" onClick={doAskAi} />
        </div>
      )}

      {/* ---- Add note inline dialog ---- */}
      {notePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNotePrompt(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <p className="text-xs italic text-muted-foreground">"{notePrompt.text}"</p>
              <textarea
                autoFocus
                className="h-24 w-full rounded-md border p-2 text-sm"
                placeholder="Write your note..."
                value={notePrompt.draft}
                onChange={(e) => setNotePrompt({ ...notePrompt, draft: e.target.value })}
              />
              <Button className="w-full" onClick={saveNote} disabled={!notePrompt.draft.trim()}>Save Note</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- AI Explain panel ---- */}
      {explainPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExplainPanel(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-medium italic">"{explainPanel.label}"</p>
              {explainPanel.loading || explainSentence.isPending ? (
                <p className="text-sm text-muted-foreground">กำลังวิเคราะห์...</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <ExplainField label="Grammar" text={explainSentence.data?.result?.grammar} />
                  <ExplainField label="Vocabulary" text={explainSentence.data?.result?.vocabulary} />
                  <ExplainField label="Natural Translation" text={explainSentence.data?.result?.naturalTranslation} />
                  <ExplainField label="Literal Translation" text={explainSentence.data?.result?.literalTranslation} />
                  {!explainSentence.data?.result && explainSentence.data?.note && (
                    <p className="text-xs text-destructive">{explainSentence.data.note}</p>
                  )}
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => setExplainPanel(null)}>Close</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Double-click word dictionary popup ---- */}
      {activeWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeWordPopup}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold capitalize">{activeWord}</p>
                  <button
                    onClick={() => playPronunciation(wordDetailResult?.audioUrl, activeWord)}
                    className="text-muted-foreground hover:text-primary"
                    title={wordDetailResult?.audioUrl ? "ฟังเสียงจริง (Wiktionary)" : "ฟังเสียง (สังเคราะห์)"}
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <button onClick={closeWordPopup} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {wordDetail.isPending ? (
                <p className="text-sm text-muted-foreground">กำลังค้นหา...</p>
              ) : wordDetailResult ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {wordDetailResult.ipa && <span>{wordDetailResult.ipa}</span>}
                    <Badge variant="secondary" className="capitalize">{wordDetailResult.partOfSpeech.toLowerCase()}</Badge>
                    {wordDetailResult.audioUrl && (
                      <Badge variant="outline" className="gap-1"><Volume2 className="h-3 w-3" /> Wiktionary audio</Badge>
                    )}
                  </div>

                  <div className="text-sm">
                    <p className="mb-0.5 font-medium text-muted-foreground">Meaning</p>
                    {wordDetailResult.meanings.map((m, i) => <p key={i}>{m}</p>)}
                  </div>

                  {wordDetailResult.example && (
                    <div className="rounded-md bg-muted p-2 text-sm">
                      <p>{wordDetailResult.example.text}</p>
                      <p className="text-xs text-muted-foreground">{wordDetailResult.example.translation}</p>
                    </div>
                  )}

                  <WordChipRow label="Synonyms" items={wordDetailResult.synonyms} />
                  <WordChipRow label="Antonyms" items={wordDetailResult.antonyms} />
                  <WordChipRow label="Word Family" items={wordDetailResult.wordFamily} />

                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="outline">CEFR {wordDetailResult.level}</Badge>
                    <span className="flex items-center gap-0.5">
                      <span className="text-amber-400">{"★".repeat(wordDetailResult.frequency)}</span>
                      <span className="text-muted-foreground">{"★".repeat(5 - wordDetailResult.frequency)}</span>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-destructive">{wordDetail.data?.note ?? "ค้นหาคำนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}</p>
              )}

              {alreadySaved ? (
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                    <Check className="h-4 