import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Copy,
  Highlighter,
  Languages,
  BookOpen,
  StickyNote,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Percent,
  ListChecks,
  Globe2,
  Eye,
  Heart,
  Share2,
  Star,
  X,
  Check,
  Book,
  Volume2,
  Eraser,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  GraduationCap,
  PenTool,
  Type as TypeIcon,
  Trash2,
  GripHorizontal,
  Pencil,
  Headphones,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePassage,
  useCreateHighlight,
  useDeleteHighlight,
  useCreateNote,
  useUpdateNote,
  useToggleBookmark,
  useUpdatePassage,
  useExplainSentence,
  useAiExplain,
  useCreateWord,
  useSubmitReadingAttempt,
  useToggleLike,
  useWordDetail,
  useWords,
  useDeleteWord,
  useCollections,
  useTags,
  useCreateCollection,
  useGrammarNotes,
  type ReadingQuestion,
  type HighlightItem,
  type WordDetailResult,
  type GrammarPoint,
} from "@/api/hooks";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

const HIGHLIGHT_COLORS = [
  "#fde68a",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#ddd6fe",
  "#fdba74",
];

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

// The Note row's `text` column is a single string, but the floating Note box
// can hold typed text AND a drawing at once - so both are packed into one JSON
// payload tagged with a version prefix. Old rows saved before this feature
// (plain text, or the single-purpose "drawing:<dataUrl>" prefix from the very
// first drawing-note pass) still parse correctly, just as text-only/image-only.
const NOTE_PAYLOAD_PREFIX = "mixed:v1:";

function buildNotePayload(text: string, drawingDataUrl: string | null): string {
  return `${NOTE_PAYLOAD_PREFIX}${JSON.stringify({ text, drawing: drawingDataUrl })}`;
}

function splitSentences(
  text: string,
): { text: string; start: number; end: number }[] {
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
    if (!/^\n\s*\n$/.test(chunk) && chunk.length)
      out.push({ text: chunk, start: offset });
    offset += chunk.length;
  }
  return out;
}

function getOffsetWithinContainer(
  container: Node,
  node: Node,
  nodeOffset: number,
): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) return offset + nodeOffset;
    offset += current.textContent?.length ?? 0;
  }
  return offset;
}

// Custom cursor for "highlighter pen" mode - a small rounded swatch in the
// currently selected pen color, so the cursor itself shows what color will be
// applied. Falls back to crosshair if custom cursor images aren't supported.
function highlightCursor(color: string): string {
  const fill = color.replace("#", "%23");
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
    `%3Crect x='2' y='2' width='16' height='16' rx='4' fill='${fill}' stroke='%23334155' stroke-width='1.5'/%3E%3C/svg%3E`;
  return `url("data:image/svg+xml,${svg}") 2 18, crosshair`;
}

// Custom cursor for "eraser" mode - a small red ring with a slash through it.
function eraserCursor(): string {
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
    `%3Ccircle cx='10' cy='10' r='8' fill='none' stroke='%23ef4444' stroke-width='2'/%3E` +
    `%3Cline x1='5' y1='5' x2='15' y2='15' stroke='%23ef4444' stroke-width='2'/%3E%3C/svg%3E`;
  return `url("data:image/svg+xml,${svg}") 10 10, pointer`;
}

function isWordChar(ch: string | undefined): boolean {
  // Letters/digits plus apostrophe/hyphen so contractions ("didn't") and
  // hyphenated words ("mid-career") don't get split by the snap below.
  return !!ch && /[A-Za-z0-9'’-]/.test(ch);
}

// Expands a [start, end) character range outward so it never starts or ends
// in the middle of a word - e.g. selecting "he Japanese....that m" snaps to
// "The Japanese....that many". Only moves the boundary when it's actually
// splitting a run of word characters; an already word-aligned boundary is
// left untouched.
function snapRangeToWords(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s > 0 && isWordChar(text[s - 1]) && isWordChar(text[s])) s--;
  while (e < text.length && isWordChar(text[e - 1]) && isWordChar(text[e])) e++;
  return { start: s, end: e };
}

export default function ReadingWorkspace({
  articleId,
  title,
  passage,
  translation,
  questions,
  testMode,
  metaLine,
  onBack,
  readOnly,
}: Props) {
  const { data: saved } = usePassage(articleId);
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
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
  // A "click" with even a pixel of mouse drift produces a tiny non-collapsed
  // selection, so both the drag-erase path (mouseup, fires first) and a <mark>'s
  // own click-to-remove handler (fires right after) can end up handling the same
  // gesture. This flag lets the mouseup handler tell the very next click handler
  // "already erased this, skip it" so the same highlight is never double-deleted.
  const suppressNextEraseClickRef = useRef(false);
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sessionWords, setSessionWords] = useState<
    { id: string; headword: string }[]
  >([]);

  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  // "Highlighter pen" mode: toggled from the bottom toolbar. While active, the passage
  // cursor becomes a colored swatch and any text selection is highlighted immediately
  // (no floating toolbar step) so the user can paint several highlights in a row.
  const [highlightMode, setHighlightMode] = useState(false);
  const [penColor, setPenColor] = useState(HIGHLIGHT_COLORS[0]);
  // Eraser mode: mutually exclusive with pen mode. While active, clicking any
  // highlighted text removes that highlight entirely.
  const [eraseMode, setEraseMode] = useState(false);

  // Free-floating Note tool: a small window - type, draw, and erase all on the
  // same surface at once (text and ink are two stacked layers; the toolbar just
  // switches which one the pointer controls), autosaves as you go (no Save
  // button), draggable anywhere over the page, closed with its own X button.
  const [noteBox, setNoteBox] = useState<{
    id: string | null;
    mode: "type" | "draw" | "erase";
    anchorText: string | null;
    anchorOffset: number | null;
    draft: string;
  } | null>(null);
  const [noteBoxPos, setNoteBoxPos] = useState({ x: 24, y: 96 });
  // Whole floating box size (width/height) - user-resizable via the corner
  // handle; the canvas/textarea surface fills whatever's left with flex-1.
  const [noteBoxSize, setNoteBoxSize] = useState({ width: 320, height: 340 });
  const [drawColor, setDrawColor] = useState("#0f172a");
  const noteCanvasRef = useRef<HTMLCanvasElement>(null);
  const noteDragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const noteResizeRef = useRef({ resizing: false, startX: 0, startY: 0, origW: 0, origH: 0 });
  const noteDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const noteAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against creating two note rows for one note: if edits keep coming
  // in faster than the first createNote round trip resolves, later autosave
  // ticks wait and retry instead of firing a second create.
  const noteCreatePendingRef = useRef(false);
  // Mirrors `noteBox` for reading inside the debounced autosave timer, so it
  // always sees the latest draft/id without relying on a stale closure.
  const noteBoxRef = useRef(noteBox);
  useEffect(() => {
    noteBoxRef.current = noteBox;
  }, [noteBox]);
  // The freeform (no text-selection anchor) scratchpad session, kept in memory
  // so closing and reopening the box restores exactly what was there before -
  // it's already durably autosaved server-side too, this just avoids the box
  // opening blank while the passage view is still mounted.
  const lastNoteSessionRef = useRef<{
    id: string | null;
    draft: string;
    drawingDataUrl: string | null;
  } | null>(null);
  const [explainPanel, setExplainPanel] = useState<{
    label: string;
    loading: boolean;
  } | null>(null);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [vocabToast, setVocabToast] = useState<string | null>(null);
  const [bottomHint, setBottomHint] = useState<string | null>(null);

  const wordDetailResult: WordDetailResult | null =
    wordDetail.data?.result ?? null;

  // Does this word already exist in the user's vocabulary? Only checked while the
  // popup is open, so idle reading never fires an extra request.
  const { data: matchingWords } = useWords(
    { search: activeWord ?? undefined },
    { enabled: !!activeWord },
  );
  const alreadySaved = activeWord
    ? matchingWords?.find(
        (w) => w.headword.toLowerCase() === activeWord.toLowerCase(),
      )
    : undefined;

  const [userTranslation, setUserTranslation] = useState("");
  const [translationChecked, setTranslationChecked] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false);
  const [currentQIndex, setCurrentQIndex] = useState(0);

  const showQuestionsBox =
    (testMode === "QUESTIONS" || testMode === "MIXED") && !!questions?.length;
  const grammarNotes = useGrammarNotes(
    articleId,
    passage,
    testMode === "GRAMMAR",
  );

  useEffect(() => {
    const t = setInterval(
      () => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );
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
    setScrollProgress(
      max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 100,
    );
  }

  const highlights = saved?.highlights ?? [];

  // Erases exactly [eraseStart, eraseEnd) from any highlight(s) it overlaps - trimming
  // a highlight that's only partly covered, splitting one the erased range falls inside
  // of, or removing it outright if fully covered. No dedicated backend endpoint needed:
  // the original is deleted and any surviving left/right remainder is recreated.
  function eraseRange(eraseStart: number, eraseEnd: number) {
    highlights
      .filter(
        (h: HighlightItem) =>
          h.startOffset < eraseEnd && h.endOffset > eraseStart,
      )
      .forEach((h: HighlightItem) => {
        deleteHighlight.mutate({ id: h.id, articleId });
        if (h.startOffset < eraseStart) {
          createHighlight.mutate({
            articleId,
            text: passage.slice(h.startOffset, eraseStart),
            startOffset: h.startOffset,
            endOffset: eraseStart,
            color: h.color,
          });
        }
        if (h.endOffset > eraseEnd) {
          createHighlight.mutate({
            articleId,
            text: passage.slice(eraseEnd, h.endOffset),
            startOffset: eraseEnd,
            endOffset: h.endOffset,
            color: h.color,
          });
        }
      });
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const start = getOffsetWithinContainer(
      containerRef.current,
      range.startContainer,
      range.startOffset,
    );
    const end = getOffsetWithinContainer(
      containerRef.current,
      range.endContainer,
      range.endOffset,
    );

    // Eraser mode: drag over any text (highlighted or not) to wipe out whatever
    // highlight color falls within that exact span - same drag gesture as painting,
    // just erasing instead. Word-snapped so it never leaves a highlight fragment
    // starting/ending mid-word.
    if (eraseMode) {
      const snapped = snapRangeToWords(
        passage,
        Math.min(start, end),
        Math.max(start, end),
      );
      eraseRange(snapped.start, snapped.end);
      suppressNextEraseClickRef.current = true;
      // Self-heals in case the drag didn't end on a <mark> (so nothing ever
      // consumes/resets the flag) - the synchronous click that follows this same
      // mouseup, if any, still runs well before this timer fires.
      setTimeout(() => {
        suppressNextEraseClickRef.current = false;
      }, 0);
      window.getSelection()?.removeAllRanges();
      return;
    }

    // Pen mode: skip the floating toolbar entirely and highlight immediately so the
    // user can drag over several spans in a row without clicking anything in between.
    if (highlightMode) {
      const snapped = snapRangeToWords(
        passage,
        Math.min(start, end),
        Math.max(start, end),
      );
      createHighlight.mutate({
        articleId,
        text: passage.slice(snapped.start, snapped.end),
        startOffset: snapped.start,
        endOffset: snapped.end,
        color: penColor,
      });
      window.getSelection()?.removeAllRanges();
      return;
    }

    const rect = range.getBoundingClientRect();
    setColorPickerOpen(false);
    // Clamp so the toolbar (rendered centered on x via -translate-x-1/2, and
    // above the selection via -translate-y-full) never renders off-screen -
    // on a narrow phone, selecting text near the left/right margin (which is
    // most of the passage width) would otherwise push it partly or fully
    // outside the viewport with no way to reach its buttons.
    const TOOLBAR_HALF_WIDTH = 130;
    const MARGIN = 8;
    const clampedX = Math.min(
      Math.max(rect.left + rect.width / 2, TOOLBAR_HALF_WIDTH + MARGIN),
      window.innerWidth - TOOLBAR_HALF_WIDTH - MARGIN
    );
    const clampedY = Math.max(rect.top, 48);
    setSelectionToolbar({
      x: clampedX,
      y: clampedY,
      text,
      start: Math.min(start, end),
      end: Math.max(start, end),
    });
  }

  function closeToolbar() {
    setSelectionToolbar(null);
    setColorPickerOpen(false);
    window.getSelection()?.removeAllRanges();
  }

  function toggleHighlightMode() {
    setHighlightMode((v) => {
      const next = !v;
      if (next) setEraseMode(false);
      return next;
    });
  }

  function toggleEraseMode() {
    setEraseMode((v) => {
      const next = !v;
      if (next) setHighlightMode(false);
      return next;
    });
  }

  function removeHighlight(id: string) {
    deleteHighlight.mutate({ id, articleId });
  }

  /** Highlighter button click - reveals the color swatch picker instead of applying immediately. */
  function doHighlight() {
    if (!selectionToolbar) return;
    setColorPickerOpen(true);
  }

  function applyHighlight(color: string) {
    if (!selectionToolbar) return;
    const snapped = snapRangeToWords(
      passage,
      selectionToolbar.start,
      selectionToolbar.end,
    );
    createHighlight.mutate({
      articleId,
      text: passage.slice(snapped.start, snapped.end),
      startOffset: snapped.start,
      endOffset: snapped.end,
      color,
    });
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
    explainSentence.mutate(
      { sentence: label, passageContext: passage },
      { onSuccess: () => setExplainPanel({ label, loading: false }) },
    );
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

  function openNoteBox(anchor?: { text: string; start: number }) {
    setNoteBoxPos({ x: Math.max(16, window.innerWidth - 360), y: 96 });
    // Reopening the generic (no-selection) Note button resumes the freeform
    // scratchpad exactly where it was left; opening from a text selection
    // always starts a distinct new anchored note.
    const resume = !anchor ? lastNoteSessionRef.current : null;
    hasDrawnRef.current = !!resume?.drawingDataUrl;
    setNoteBox({
      id: resume?.id ?? null,
      mode: "type",
      anchorText: anchor?.text ?? null,
      anchorOffset: anchor?.start ?? null,
      draft: resume?.draft ?? "",
    });
    // Canvas mounts fresh each open, so redraw whatever was saved onto it.
    requestAnimationFrame(() => {
      const canvas = noteCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (resume?.drawingDataUrl) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = resume.drawingDataUrl;
      }
    });
  }

  function closeNoteBox() {
    if (noteBox && !noteBox.anchorText) {
      const canvas = noteCanvasRef.current;
      lastNoteSessionRef.current = {
        id: noteBox.id,
        draft: noteBox.draft,
        drawingDataUrl: hasDrawnRef.current && canvas ? canvas.toDataURL("image/png") : null,
      };
    }
    if (noteAutosaveTimerRef.current) clearTimeout(noteAutosaveTimerRef.current);
    setNoteBox(null);
  }

  function doAddNotePrompt() {
    if (!selectionToolbar) return;
    openNoteBox({ text: selectionToolbar.text, start: selectionToolbar.start });
    closeToolbar();
  }

  // Autosave - no Save button. Called (debounced) after every text edit and
  // right after every pen/eraser stroke, so the note is always up to date.
  function scheduleAutosave() {
    if (noteAutosaveTimerRef.current) clearTimeout(noteAutosaveTimerRef.current);
    noteAutosaveTimerRef.current = setTimeout(autosaveNote, 500);
  }

  function autosaveNote() {
    // Reads from a ref (not the setNoteBox updater) on purpose - React 18
    // StrictMode double-invokes state updater functions in dev to catch
    // impure ones, which would fire mutate() twice per autosave if it lived
    // inside setNoteBox(current => ...) instead.
    const current = noteBoxRef.current;
    if (!current) return;
    const canvas = noteCanvasRef.current;
    const drawingDataUrl = hasDrawnRef.current && canvas ? canvas.toDataURL("image/png") : null;
    if (!current.draft.trim() && !drawingDataUrl) return; // nothing to save yet
    const text = buildNotePayload(current.draft, drawingDataUrl);
    if (current.id) {
      updateNote.mutate({ id: current.id, articleId, text });
      return;
    }
    if (noteCreatePendingRef.current) {
      // A create for this note is already in flight - retry shortly once it
      // resolves and current.id is set, instead of creating a second row.
      scheduleAutosave();
      return;
    }
    noteCreatePendingRef.current = true;
    createNote.mutate(
      {
        articleId,
        text,
        ...(current.anchorText ? { anchorText: current.anchorText } : {}),
        ...(current.anchorOffset != null ? { anchorOffset: current.anchorOffset } : {}),
      },
      {
        onSuccess: (created) => {
          noteCreatePendingRef.current = false;
          setNoteBox((prev) => (prev ? { ...prev, id: created.id } : prev));
        },
        onError: () => {
          noteCreatePendingRef.current = false;
        },
      },
    );
  }

  function doVocabularySelection() {
    if (!selectionToolbar) return;
    const headword = selectionToolbar.text;
    explainWord.mutate(headword, {
      onSuccess: (data: any) => {
        createWord.mutate(
          { headword, meaning: data?.meaning ?? "" },
          {
            onSuccess: (created: any) =>
              setSessionWords((prev) => [
                ...prev,
                { id: created.id, headword: created.headword },
              ]),
          },
        );
      },
    });
    closeToolbar();
  }

  function clearNoteCanvas() {
    const canvas = noteCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    scheduleAutosave();
  }

  function handleNoteCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = noteCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !noteBox || noteBox.mode === "type") return;
    canvas.setPointerCapture(e.pointerId);
    noteDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    if (noteBox.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 20;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = 3;
      hasDrawnRef.current = true;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handleNoteCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!noteDrawingRef.current) return;
    const canvas = noteCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function handleNoteCanvasPointerUp() {
    if (!noteDrawingRef.current) return;
    noteDrawingRef.current = false;
    scheduleAutosave();
  }

  // ---- Floating note box dragging (grab the header, move the whole box) ----
  function handleNoteHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    noteDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: noteBoxPos.x, origY: noteBoxPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleNoteHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!noteDragRef.current.dragging) return;
    const dx = e.clientX - noteDragRef.current.startX;
    const dy = e.clientY - noteDragRef.current.startY;
    setNoteBoxPos({ x: noteDragRef.current.origX + dx, y: noteDragRef.current.origY + dy });
  }

  function handleNoteHeaderPointerUp() {
    noteDragRef.current.dragging = false;
  }

  // ---- Floating note box resizing (grab the bottom-right corner handle) ----
  const NOTE_BOX_MIN_WIDTH = 260;
  const NOTE_BOX_MIN_HEIGHT = 220;

  function handleNoteResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    noteResizeRef.current = {
      resizing: true,
      startX: e.clientX,
      startY: e.clientY,
      origW: noteBoxSize.width,
      origH: noteBoxSize.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleNoteResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!noteResizeRef.current.resizing) return;
    const dx = e.clientX - noteResizeRef.current.startX;
    const dy = e.clientY - noteResizeRef.current.startY;
    setNoteBoxSize({
      width: Math.max(NOTE_BOX_MIN_WIDTH, noteResizeRef.current.origW + dx),
      height: Math.max(NOTE_BOX_MIN_HEIGHT, noteResizeRef.current.origH + dy),
    });
  }

  function handleNoteResizePointerUp() {
    noteResizeRef.current.resizing = false;
  }

  // Keep the canvas's internal pixel buffer in sync with its rendered CSS
  // size whenever the box is resized (or first opened) - otherwise drawing
  // coordinates (which assume canvas.width/height == rendered size) drift,
  // and a plain CSS-stretched canvas would look blurry. Resizing a canvas
  // clears it, so the previous drawing is captured and redrawn scaled to fit.
  useEffect(() => {
    if (!noteBox) return;
    const canvas = noteCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    const prevDataUrl = hasDrawnRef.current ? canvas.toDataURL("image/png") : null;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    if (prevDataUrl) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, nextWidth, nextHeight);
      };
      img.src = prevDataUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteBox, noteBoxSize]);

  function explainSentenceClick(sentenceText: string) {
    setExplainPanel({ label: sentenceText, loading: true });
    explainSentence.mutate(
      { sentence: sentenceText, passageContext: passage },
      {
        onSuccess: () =>
          setExplainPanel({ label: sentenceText, loading: false }),
      },
    );
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
    return (
      highlights && saved?.bookmarks?.some((b) => b.anchorOffset === start)
    );
  }

  function toggleParagraphBookmark(start: number, text: string) {
    toggleBookmark.mutate({
      articleId,
      anchorOffset: start,
      anchorText: text.slice(0, 60),
    });
  }

  // ---- render a paragraph: sentence-split, each sentence highlight+word aware ----
  function renderParagraph(paraText: string, paraStart: number, key: number) {
    const sentences = splitSentences(paraText);
    return (
      <div key={key} className="group/para relative py-1 pl-6 mt-4">
        <button
          type="button"
          className="absolute left-0 top-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/para:opacity-100"
          onClick={() => toggleParagraphBookmark(paraStart, paraText)}
          title="Bookmark this paragraph"
        >
          {paragraphBookmarked(paraStart) ? (
            <BookmarkCheck className="h-4 w-4 text-primary" />
          ) : (
            <Bookmark className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {sentences.map((s, i) =>
          renderSentence(
            s.text,
            paraStart + s.start,
            paraStart + s.end,
            `${key}-${i}`,
          ),
        )}
      </div>
    );
  }

  function renderSentence(
    sentenceText: string,
    absStart: number,
    absEnd: number,
    key: string,
  ) {
    // Local highlight segments within this sentence's absolute range.
    const points = new Set([absStart, absEnd]);
    highlights.forEach((h: HighlightItem) => {
      if (h.startOffset < absEnd && h.endOffset > absStart) {
        points.add(Math.max(h.startOffset, absStart));
        points.add(Math.min(h.endOffset, absEnd));
      }
    });
    const bounds = Array.from(points).sort((a, b) => a - b);
    const segments: {
      text: string;
      color: string | null;
      highlightId: string | null;
    }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const segStart = bounds[i];
      const segEnd = bounds[i + 1];
      if (segStart >= segEnd) continue;
      const hit = highlights.find(
        (h: HighlightItem) =>
          h.startOffset <= segStart && h.endOffset >= segEnd,
      );
      segments.push({
        text: sentenceText.slice(segStart - absStart, segEnd - absStart),
        color: hit?.color ?? null,
        highlightId: hit?.id ?? null,
      });
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
            ),
          );
          return seg.color ? (
            <mark
              key={i}
              style={{ backgroundColor: seg.color }}
              className={cn(
                "rounded px-0.5 text-inherit",
                eraseMode &&
                  "cursor-pointer opacity-100 ring-2 ring-transparent transition-all hover:opacity-50 hover:ring-destructive",
              )}
              title={eraseMode ? "Click to remove this highlight" : undefined}
              onClick={(e) => {
                if (!eraseMode || !seg.highlightId) return;
                e.preventDefault();
                e.stopPropagation();
                // The mouseup that just fired may have already erased this via the
                // drag path (see suppressNextEraseClickRef) - don't double-delete.
                if (suppressNextEraseClickRef.current) {
                  suppressNextEraseClickRef.current = false;
                  return;
                }
                removeHighlight(seg.highlightId);
              }}
            >
              {body}
            </mark>
          ) : (
            <span key={i}>{body}</span>
          );
        })}
        <button
          type="button"
          className="ml-0.5 inline-flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover/sentence:opacity-100"
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
      const givenRaw = answers[i] ?? "";
      if (q.type === "MATCHING" && q.pairs) {
        try {
          const given: string[] = JSON.parse(givenRaw);
          if (
            given.length === q.pairs.length &&
            given.every((v, idx) => v === q.pairs![idx].right)
          )
            correct++;
        } catch {
          /* not answered yet */
        }
        return;
      }
      if (q.type === "ORDERING" && q.items) {
        try {
          const given: string[] = JSON.parse(givenRaw);
          if (
            given.length === q.items.length &&
            given.every((v, idx) => v === q.items![idx])
          )
            correct++;
        } catch {
          /* not answered yet */
        }
        return;
      }
      const given = givenRaw.trim().toLowerCase();
      const expected = q.answer.trim().toLowerCase();
      const isShortForm = q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER";
      if (
        given &&
        (given === expected ||
          (isShortForm && given.length > 2 && expected.includes(given)))
      )
        correct++;
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
      submitAttempt.mutate({
        correctCount: correct,
        totalCount: total || 1,
        articleId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, questions, questionsSubmitted]);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 pb-24 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />{" "}
            {readOnly ? "Back" : "New Exercise"}
          </Button>
          {metaLine && (
            <p className="text-xs text-muted-foreground">{metaLine}</p>
          )}
        </div>

        <Card>
          <CardContent className="space-y-1 p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to={`/listening/${articleId}`}>
                    <Headphones className="h-3.5 w-3.5" /> Test Listening
                  </Link>
                </Button>
                {!readOnly && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to={`/reading/${articleId}/edit`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                )}
                {readOnly && saved ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => toggleLike.mutate(articleId)}
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4",
                        saved.stats.liked && "fill-red-500 text-red-500",
                      )}
                    />
                    {saved.stats.likes}
                  </Button>
                ) : !readOnly ? (
                  <VisibilityPills
                    visibility={saved?.visibility}
                    onUpdate={(v) =>
                      updatePassage.mutate({ id: articleId, visibility: v })
                    }
                  />
                ) : null}
              </div>
            </div>
            {/* While pen mode is active, preview the live text-selection in the current
                pen color instead of the browser's default blue ::selection. Erase mode
                gets a neutral gray preview instead, so a drag never looks like it's
                painting a new (blue) highlight while you're erasing. */}
            {highlightMode && (
              <style>{`.reading-pen-mode::selection, .reading-pen-mode *::selection { background-color: ${penColor}; }`}</style>
            )}
            {eraseMode && (
              <style>{`.reading-erase-mode::selection, .reading-erase-mode *::selection { background-color: #e2e8f0; }`}</style>
            )}
            <div
              ref={(el) => {
                containerRef.current = el;
              }}
              onMouseUp={handleMouseUp}
              className={cn(
                "select-text leading-8",
                highlightMode && "reading-pen-mode",
                eraseMode && "reading-erase-mode",
              )}
              style={{
                // marginTop: "0.25rem",
                cursor: highlightMode
                  ? highlightCursor(penColor)
                  : eraseMode
                    ? eraserCursor()
                    : undefined,
              }}
            >
              {paragraphs.map((p, i) => (
                <Fragment key={i}>
                  {renderParagraph(p.text, p.start, i)}
                  {/* Hidden text node carrying the exact characters skipped between paragraphs
                      (blank lines) - without this, getOffsetWithinContainer's DOM text-node walk
                      undercounts by the gap length for every paragraph after the first, so
                      highlight/selection offsets drift and land on the wrong text. */}
                  {i < paragraphs.length - 1 && (
                    <span aria-hidden="true" className="hidden">
                      {passage.slice(
                        p.start + p.text.length,
                        paragraphs[i + 1].start,
                      )}
                    </span>
                  )}
                </Fragment>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ---- Right sidebar: Reading Progress + mode-specific box, joined into one panel ---- */}
      <div className="space-y-3">
        <Card className="lg:sticky lg:top-4">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-3">
              <h2 className="font-semibold">Reading Progress</h2>
              <StatRow
                icon={<Percent className="h-4 w-4" />}
                label="Progress"
                value={`${scrollProgress}%`}
              />
              <StatRow
                icon={<Clock className="h-4 w-4" />}
                label="Reading Time"
                value={formatTime(elapsedSec)}
              />
              <StatRow
                icon={<BookOpen className="h-4 w-4" />}
                label="Words Saved"
                value={String(sessionWords.length)}
              />
              <StatRow
                icon={<ListChecks className="h-4 w-4" />}
                label="Questions"
                value={String(questions?.length ?? 0)}
              />
              <StatRow
                icon={<Bookmark className="h-4 w-4" />}
                label="Bookmarks"
                value={String(saved?.bookmarks?.length ?? 0)}
              />
              {readOnly && saved && (
                <>
                  <hr />
                  <StatRow
                    icon={<Eye className="h-4 w-4" />}
                    label="Views"
                    value={String(saved.stats.views)}
                  />
                  <StatRow
                    icon={<Globe2 className="h-4 w-4" />}
                    label="Attempts"
                    value={String(saved.stats.attempts)}
                  />
                  {saved.stats.avgScorePercent != null && (
                    <StatRow
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      label="Avg Score"
                      value={`${saved.stats.avgScorePercent}%`}
                    />
                  )}
                </>
              )}
            </div>

            {(testMode === "TRANSLATION" ||
              showQuestionsBox ||
              testMode === "VOCABULARY" ||
              testMode === "GRAMMAR") && (
              <>
                <hr />

                {testMode === "TRANSLATION" && (
                  <ExpandableSidebarCard
                    bare
                    title="Translation"
                    icon={<Languages className="h-4 w-4" />}
                  >
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
                    bare
                    title="Questions"
                    icon={<ListChecks className="h-4 w-4" />}
                    headerExtra={
                      <Badge variant="secondary">
                        {Object.keys(answers).length} / {questions!.length}
                      </Badge>
                    }
                    renderExpanded={(collapse) => (
                      <QuestionPlayerFullscreen
                        questions={questions!}
                        currentIndex={currentQIndex}
                        onNavigate={setCurrentQIndex}
                        answers={answers}
                        onAnswer={updateAnswer}
                        onExit={collapse}
                        scrollProgress={scrollProgress}
                        elapsedSec={elapsedSec}
                        wordsSavedCount={sessionWords.length}
                        bookmarksCount={saved?.bookmarks?.length ?? 0}
                      />
                    )}
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
                  <ExpandableSidebarCard
                    bare
                    title="Vocabulary"
                    icon={<BookOpen className="h-4 w-4" />}
                    expandable={false}
                  >
                    <VocabularyBox
                      words={sessionWords}
                      onRemove={(id) => {
                        deleteWord.mutate(id);
                        setSessionWords((prev) =>
                          prev.filter((w) => w.id !== id),
                        );
                      }}
                    />
                  </ExpandableSidebarCard>
                )}

                {testMode === "GRAMMAR" && (
                  <ExpandableSidebarCard
                    bare
                    title="Grammar Points"
                    icon={<GraduationCap className="h-4 w-4" />}
                    expandable={false}
                  >
                    <GrammarBox query={grammarNotes} />
                  </ExpandableSidebarCard>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Attach the scroll listener to the window since the passage flows in-page. */}
        <ScrollTracker onScroll={onScroll} scrollRef={scrollRef} />
      </div>

      {/* ---- Floating selection toolbar ---- */}
      {selectionToolbar && (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
          style={{ left: selectionToolbar.x, top: selectionToolbar.y - 8 }}
        >
          {colorPickerOpen ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-6 w-6 shrink-0 rounded-full border-2 border-transparent shadow-sm transition-transform hover:scale-110 hover:border-foreground/30"
                  style={{ backgroundColor: color }}
                  onClick={() => applyHighlight(color)}
                  aria-label={`Highlight in this color`}
                  title="Highlight in this color"
                />
              ))}
              <button
                type="button"
                onClick={() => setColorPickerOpen(false)}
                className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Cancel"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <ToolbarBtn
                icon={<Highlighter className="h-3.5 w-3.5" />}
                label="Highlight"
                onClick={doHighlight}
              />
              <ToolbarBtn
                icon={<Languages className="h-3.5 w-3.5" />}
                label="Translate"
                onClick={doTranslateSelection}
              />
              <ToolbarBtn
                icon={<BookOpen className="h-3.5 w-3.5" />}
                label="Dictionary"
                onClick={doDictionarySelection}
              />
              <ToolbarBtn
                icon={<StickyNote className="h-3.5 w-3.5" />}
                label="Add Note"
                onClick={doAddNotePrompt}
              />
              <ToolbarBtn
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Copy"
                onClick={doCopy}
              />
              <ToolbarBtn
                icon={<Plus className="h-3.5 w-3.5" />}
                label="Vocabulary"
                onClick={doVocabularySelection}
              />
              <ToolbarBtn
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Ask AI"
                onClick={doAskAi}
              />
            </>
          )}
        </div>
      )}

      {/* ---- Free-floating Note box: no backdrop, draggable by its header, closed with X ---- */}
      {noteBox && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-popover shadow-xl"
          style={{ left: noteBoxPos.x, top: noteBoxPos.y, width: noteBoxSize.width, height: noteBoxSize.height }}
        >
          <div
            className="flex shrink-0 cursor-move items-center justify-between gap-2 border-b bg-muted/60 px-3 py-2 select-none"
            onPointerDown={handleNoteHeaderPointerDown}
            onPointerMove={handleNoteHeaderPointerMove}
            onPointerUp={handleNoteHeaderPointerUp}
          >
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <StickyNote className="h-4 w-4" /> Note
            </div>
            <button
              type="button"
              onClick={closeNoteBox}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
            {noteBox.anchorText && (
              <p className="line-clamp-2 shrink-0 rounded-md bg-muted/50 p-2 text-xs italic text-muted-foreground">
                "{noteBox.anchorText}"
              </p>
            )}

            <div className="flex shrink-0 gap-1 rounded-md bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setNoteBox({ ...noteBox, mode: "type" })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                  noteBox.mode === "type" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TypeIcon className="h-3.5 w-3.5" /> Type
              </button>
              <button
                type="button"
                onClick={() => setNoteBox({ ...noteBox, mode: "draw" })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                  noteBox.mode === "draw" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <PenTool className="h-3.5 w-3.5" /> Draw
              </button>
              <button
                type="button"
                onClick={() => setNoteBox({ ...noteBox, mode: "erase" })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                  noteBox.mode === "erase" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Eraser className="h-3.5 w-3.5" /> Erase
              </button>
            </div>

            {/* Type, Draw and Erase all act on the SAME surface at once (like iPad
                Notes) - the textarea and canvas are stacked layers, and the mode
                just decides which layer currently receives the pointer/keyboard.
                flex-1 + min-h-0 so this surface grows/shrinks with the box. */}
            <div className="relative min-h-[80px] w-full flex-1 overflow-hidden rounded-md border bg-white">
              <textarea
                autoFocus={noteBox.mode === "type"}
                className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent p-2 text-sm outline-none"
                style={{ pointerEvents: noteBox.mode === "type" ? "auto" : "none" }}
                placeholder="Type, draw, or write..."
                value={noteBox.draft}
                onChange={(e) => {
                  setNoteBox({ ...noteBox, draft: e.target.value });
                  scheduleAutosave();
                }}
              />
              <canvas
                ref={noteCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ pointerEvents: noteBox.mode === "type" ? "none" : "auto", touchAction: "none" }}
                onPointerDown={handleNoteCanvasPointerDown}
                onPointerMove={handleNoteCanvasPointerMove}
                onPointerUp={handleNoteCanvasPointerUp}
                onPointerLeave={handleNoteCanvasPointerUp}
              />
            </div>

            {noteBox.mode !== "type" && (
              <div className="flex shrink-0 items-center gap-1.5">
                {["#0f172a", "#ef4444", "#2563eb", "#16a34a", "#f59e0b"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDrawColor(color)}
                    disabled={noteBox.mode === "erase"}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-30",
                      drawColor === color ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    aria-label="Choose pen color"
                  />
                ))}
                <button
                  type="button"
                  onClick={clearNoteCanvas}
                  className="ml-auto flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="Clear drawing"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            )}

            <p className="shrink-0 text-center text-[11px] text-muted-foreground">Saved automatically</p>
          </div>

          {/* Resize handle - bottom-right corner, drag to resize both width and height. */}
          <div
            onPointerDown={handleNoteResizePointerDown}
            onPointerMove={handleNoteResizePointerMove}
            onPointerUp={handleNoteResizePointerUp}
            title="Resize"
            className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2 2 14M14 8 8 14M14 14h.01" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      {/* ---- AI Explain panel ---- */}
      {explainPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExplainPanel(null)}
        >
          <Card
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-medium italic">
                "{explainPanel.label}"
              </p>
              {explainPanel.loading || explainSentence.isPending ? (
                <p className="text-sm text-muted-foreground">
                  กำลังวิเคราะห์...
                </p>
              ) : (
                <div className="space-y-3 text-sm">
                  <ExplainField
                    label="Grammar"
                    text={explainSentence.data?.result?.grammar}
                  />
                  <ExplainField
                    label="Vocabulary"
                    text={explainSentence.data?.result?.vocabulary}
                  />
                  <ExplainField
                    label="Natural Translation"
                    text={explainSentence.data?.result?.naturalTranslation}
                  />
                  <ExplainField
                    label="Literal Translation"
                    text={explainSentence.data?.result?.literalTranslation}
                  />
                  {!explainSentence.data?.result &&
                    explainSentence.data?.note && (
                      <p className="text-xs text-destructive">
                        {explainSentence.data.note}
                      </p>
                    )}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setExplainPanel(null)}
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Double-click word dictionary popup ---- */}
      {activeWord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeWordPopup}
        >
          <Card
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold capitalize">
                    {activeWord}
                  </p>
                  <button
                    onClick={() =>
                      playPronunciation(wordDetailResult?.audioUrl, activeWord)
                    }
                    className="text-muted-foreground hover:text-primary"
                    title={
                      wordDetailResult?.audioUrl
                        ? "ฟังเสียงจริง (Wiktionary)"
                        : "ฟังเสียง (สังเคราะห์)"
                    }
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={closeWordPopup}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {wordDetail.isPending ? (
                <p className="text-sm text-muted-foreground">กำลังค้นหา...</p>
              ) : wordDetailResult ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {wordDetailResult.ipa && (
                      <span>{wordDetailResult.ipa}</span>
                    )}
                    <Badge variant="secondary" className="capitalize">
                      {wordDetailResult.partOfSpeech.toLowerCase()}
                    </Badge>
                    {wordDetailResult.audioUrl && (
                      <Badge variant="outline" className="gap-1">
                        <Volume2 className="h-3 w-3" /> Wiktionary audio
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm">
                    <p className="mb-0.5 font-medium text-muted-foreground">
                      Meaning
                    </p>
                    {wordDetailResult.meanings.map((m, i) => (
                      <p key={i}>{m}</p>
                    ))}
                  </div>

                  {wordDetailResult.example && (
                    <div className="rounded-md bg-muted p-2 text-sm">
                      <p>{wordDetailResult.example.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {wordDetailResult.example.translation}
                      </p>
                    </div>
                  )}

                  <WordChipRow
                    label="Synonyms"
                    items={wordDetailResult.synonyms}
                  />
                  <WordChipRow
                    label="Antonyms"
                    items={wordDetailResult.antonyms}
                  />
                  <WordChipRow
                    label="Word Family"
                    items={wordDetailResult.wordFamily}
                  />

                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="outline">
                      CEFR {wordDetailResult.level}
                    </Badge>
                    <span className="flex items-center gap-0.5">
                      <span className="text-amber-400">
                        {"★".repeat(wordDetailResult.frequency)}
                      </span>
                      <span className="text-muted-foreground">
                        {"★".repeat(5 - wordDetailResult.frequency)}
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-destructive">
                  {wordDetail.data?.note ??
                    "ค้นหาคำนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
                </p>
              )}

              {alreadySaved ? (
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                    <Check className="h-4 w-4" /> Already in Collection
                  </p>
                  <div className="flex gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                    >
                      <Link
                        to={`/vocabulary?collectionId=ALL_WORDS&search=${encodeURIComponent(activeWord)}`}
                      >
                        <Book className="h-3.5 w-3.5" /> View Vocabulary
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => {
                        deleteWord.mutate(alreadySaved.id);
                        setSessionWords((prev) =>
                          prev.filter((w) => w.id !== alreadySaved.id),
                        );
                      }}
                      disabled={deleteWord.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {justSaved ? (
                    <Button
                      asChild
                      variant="outline"
                      className="flex-1 gap-1.5"
                    >
                      <Link
                        to={`/vocabulary?collectionId=ALL_WORDS&search=${encodeURIComponent(activeWord)}`}
                      >
                        <Book className="h-4 w-4" /> View Details
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="flex-1 gap-1.5"
                      disabled
                    >
                      <Book className="h-4 w-4" /> View Details
                    </Button>
                  )}
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => setSaveDialogOpen(true)}
                    disabled={justSaved || !wordDetailResult}
                  >
                    {justSaved ? (
                      <>
                        <Check className="h-4 w-4" /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Add to Vocabulary
                      </>
                    )}
                  </Button>
                </div>
              )}

              {vocabToast && (
                <p className="rounded-md bg-foreground px-3 py-1.5 text-center text-xs font-medium text-background">
                  ✓ {vocabToast}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Save Vocabulary dialog (triggered from the dictionary popup) ---- */}
      <SaveVocabularyDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        word={activeWord ?? ""}
        detail={wordDetailResult}
        onSaved={(collectionName, savedWord) => {
          setSessionWords((prev) => [...prev, savedWord]);
          setJustSaved(true);
          setVocabToast(
            collectionName
              ? `Saved to "${collectionName}"`
              : "Saved to Vocabulary",
          );
          setTimeout(() => setVocabToast(null), 3500);
        }}
      />

      {/* ---- Persistent bottom toolbar ---- */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        {bottomHint && (
          <p className="border-b bg-muted/60 py-1 text-center text-xs text-muted-foreground">
            {bottomHint}
          </p>
        )}
        {highlightMode && (
          <div className="flex items-center justify-center gap-2 border-b bg-muted/60 py-1.5">
            <span className="text-xs text-muted-foreground">Pen color:</span>
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setPenColor(color)}
                className={cn(
                  "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                  penColor === color
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{ backgroundColor: color }}
                aria-label="Choose pen color"
                title="Choose pen color"
              />
            ))}
          </div>
        )}
        {eraseMode && (
          <p className="border-b bg-muted/60 py-1.5 text-center text-xs text-muted-foreground">
            Tap or drag over a highlight to remove it
          </p>
        )}
        <div className="mx-auto flex max-w-sm items-center justify-around py-2">
          <BottomToolButton
            icon={<Highlighter className="h-5 w-5" />}
            label={highlightMode ? "Done" : "Highlight"}
            active={highlightMode}
            onClick={toggleHighlightMode}
          />
          <BottomToolButton
            icon={<Eraser className="h-5 w-5" />}
            label={eraseMode ? "Done" : "Eraser"}
            active={eraseMode}
            onClick={toggleEraseMode}
          />
          <BottomToolButton
            icon={<StickyNote className="h-5 w-5" />}
            label="Note"
            active={!!noteBox}
            onClick={() => {
              if (noteBox) {
                closeNoteBox();
                return;
              }
              if (selectionToolbar) {
                doAddNotePrompt();
              } else {
                openNoteBox();
              }
            }}
          />
          <BottomToolButton
            icon={<MoreHorizontal className="h-5 w-5" />}
            label="More"
            disabled
            badge="Coming soon"
          />
        </div>
      </div>
    </div>
  );
}

function WordChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SaveVocabularyDialog({
  open,
  onOpenChange,
  word,
  detail,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  word: string;
  detail: WordDetailResult | null;
  onSaved: (
    collectionName: string | null,
    savedWord: { id: string; headword: string },
  ) => void;
}) {
  const { data: collections } = useCollections();
  const { data: tags } = useTags();
  const createWord = useCreateWord();
  const createCollection = useCreateCollection();

  const [collectionChoice, setCollectionChoice] = useState("NONE"); // "NONE" | "NEW" | <collection id>
  const [newCollectionName, setNewCollectionName] = useState("");
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState(3);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCollectionChoice("NONE");
    setNewCollectionName("");
    setTagIds(new Set());
    setDifficulty(detail?.frequency ?? 3);
    setNote("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleTag(id: string) {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (collectionChoice === "NEW" && !newCollectionName.trim()) {
      setError("Enter a name for the new collection.");
      return;
    }
    try {
      let collectionId: string | undefined;
      let collectionLabel: string | null = null;

      if (collectionChoice === "NEW") {
        const created = await createCollection.mutateAsync({
          name: newCollectionName.trim(),
        });
        collectionId = created.id;
        collectionLabel = created.name;
      } else if (collectionChoice !== "NONE") {
        collectionId = collectionChoice;
        collectionLabel =
          collections?.find((c) => c.id === collectionChoice)?.name ?? null;
      }

      const created: any = await createWord.mutateAsync({
        headword: word,
        sourceLang: "en",
        meaning: detail?.meanings?.join("; ") || word,
        ipa: detail?.ipa ?? undefined,
        audioUrl: detail?.audioUrl ?? undefined,
        type: (detail?.partOfSpeech ?? "OTHER") as any,
        level: (detail?.level ?? "A1") as any,
        example: detail?.example?.text ?? undefined,
        exampleTranslate: detail?.example?.translation ?? undefined,
        synonym: detail?.synonyms?.join(", ") || undefined,
        opposite: detail?.antonyms?.join(", ") || undefined,
        frequency: difficulty,
        collectionId,
        tagIds: Array.from(tagIds),
        note: note.trim() || undefined,
        translations: { th: detail?.meanings?.[0] ?? "" },
      } as any);

      onOpenChange(false);
      onSaved(collectionLabel, { id: created.id, headword: created.headword });
    } catch (err: any) {
      setError(
        err?.response?.data?.error ??
          "Could not save this word. Please try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Vocabulary</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Word</Label>
            <Input value={word} disabled />
          </div>

          <div>
            <Label className="mb-1.5 block">Collection</Label>
            <Select
              value={collectionChoice}
              onValueChange={setCollectionChoice}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No Collection</SelectItem>
                {collections?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
                <SelectItem value="NEW">+ Create Collection</SelectItem>
              </SelectContent>
            </Select>
            {collectionChoice === "NEW" && (
              <Input
                className="mt-2"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder='e.g. "TOEIC"'
                autoFocus
              />
            )}
          </div>

          <div>
            <Label className="mb-1.5 block">Tag</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    tagIds.has(t.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {t.name}
                </button>
              ))}
              {!tags?.length && (
                <p className="text-xs text-muted-foreground">
                  No tags yet - add some from the Vocabulary page.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Difficulty</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setDifficulty(n)}>
                  <Star
                    className={cn(
                      "h-5 w-5",
                      n <= difficulty
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Personal Note</Label>
            <textarea
              className="h-20 w-full rounded-md border p-2 text-sm"
              placeholder="e.g. this comes up a lot in TOEIC"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={save}
              disabled={createWord.isPending || createCollection.isPending}
            >
              {createWord.isPending || createCollection.isPending
                ? "Saving..."
                : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScrollTracker({
  onScroll,
  scrollRef,
}: {
  onScroll: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    function handler() {
      // Track scroll progress against the whole document, since the passage
      // flows within the normal page scroll rather than its own inner scrollbox.
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const el = scrollRef.current;
      if (el) el.scrollTop = max > 0 ? window.scrollY : 0;
      onScroll();
    }
    const fakeEl = {
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    };
    (scrollRef as any).current = fakeEl;
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Compact Visibility control - lives on the right of the passage title row now
// (instead of its own standalone Card below the passage).
function VisibilityPills({
  visibility,
  onUpdate,
}: {
  visibility?: string;
  onUpdate: (visibility: string) => void;
}) {
  const options = [
    { value: "PRIVATE", label: "Private" },
    { value: "UNLISTED", label: "Unlisted" },
    { value: "PUBLIC", label: "Public" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onUpdate(o.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            visibility === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A sidebar Card whose contents can also be popped into a fullscreen overlay -
// used by the Translation and Questions boxes so they're easier to focus on.
// `bare` skips the outer Card/CardContent wrapper so the caller can embed this
// as a section within another Card (e.g. joined under "Reading Progress").
function ExpandableSidebarCard({
  title,
  icon,
  expandable = true,
  headerExtra,
  children,
  bare = false,
  renderExpanded,
}: {
  title: string;
  icon: React.ReactNode;
  expandable?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  bare?: boolean;
  // Opt-in bespoke fullscreen layout (e.g. the Question Navigator player) -
  // when provided, this replaces the generic centered-column overlay below.
  renderExpanded?: (collapse: () => void) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 font-semibold">
        {icon}
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {headerExtra}
        {expandable && (
          <button
            onClick={() => setExpanded(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Expand"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
  return (
    <>
      {bare ? (
        <div className="space-y-3">
          {header}
          {children}
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-4">
            {header}
            {children}
          </CardContent>
        </Card>
      )}

      {expanded && renderExpanded ? (
        renderExpanded(() => setExpanded(false))
      ) : (
        expanded && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:p-8">
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                  {icon}
                  {title}
                </h2>
                <div className="flex items-center gap-3">
                  {headerExtra}
                  <button
                    onClick={() => setExpanded(false)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Collapse"
                  >
                    <Minimize2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto">{children}</div>
            </div>
          </div>
        )
      )}
    </>
  );
}

// Question type -> badge (icon + label) shown under the prompt in the
// fullscreen Question Navigator player.
const QUESTION_TYPE_BADGES: Record<string, { icon: typeof LayoutGrid; label: string }> = {
  MULTIPLE_CHOICE: { icon: LayoutGrid, label: "Multiple Choice" },
  TRUE_FALSE: { icon: CheckCircle2, label: "True / False" },
  YES_NO_NOTGIVEN: { icon: CheckCircle2, label: "Yes / No / Not Given" },
  FILL_BLANK: { icon: PenTool, label: "Fill in the Blank" },
  SHORT_ANSWER: { icon: PenTool, label: "Short Answer" },
  ESSAY: { icon: StickyNote, label: "Essay" },
  MATCHING: { icon: ListChecks, label: "Matching" },
  ORDERING: { icon: ListChecks, label: "Ordering" },
};

// Dedicated fullscreen "Question Navigator" player - a distinct exam-style
// layout (left sidebar with Reading Progress/Your Progress ring/Question
// Navigator grid, right panel with a large one-question-at-a-time card) used
// when the Questions sidebar box is expanded, instead of the generic
// ExpandableSidebarCard overlay.
function QuestionPlayerFullscreen({
  questions,
  currentIndex,
  onNavigate,
  answers,
  onAnswer,
  onExit,
  scrollProgress,
  elapsedSec,
  wordsSavedCount,
  bookmarksCount,
}: {
  questions: ReadingQuestion[];
  currentIndex: number;
  onNavigate: (i: number) => void;
  answers: Record<number, string>;
  onAnswer: (i: number, value: string) => void;
  onExit: () => void;
  scrollProgress: number;
  elapsedSec: number;
  wordsSavedCount: number;
  bookmarksCount: number;
}) {
  const total = questions.length;
  const current = questions[currentIndex];
  const isAnswered = (i: number) => !!answers[i]?.trim();
  const answeredExcludingCurrent = questions.filter((_, i) => i !== currentIndex && isAnswered(i)).length;
  const unansweredExcludingCurrent = Math.max(0, total - answeredExcludingCurrent - 1);
  const progressPercent = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
  const donutPercent = total ? Math.round((answeredExcludingCurrent / total) * 100) : 0;

  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (donutPercent / 100) * C;
  const badge = QUESTION_TYPE_BADGES[current?.type ?? "MULTIPLE_CHOICE"] ?? QUESTION_TYPE_BADGES.MULTIPLE_CHOICE;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sidebarPanel = (
    <>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-bold">LingoDeck</p>
          <p className="text-xs text-muted-foreground">Reading Practice</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Reading Progress</h3>
          <StatRow icon={<Percent className="h-4 w-4" />} label="Progress" value={`${scrollProgress}%`} />
          <StatRow icon={<Clock className="h-4 w-4" />} label="Reading Time" value={formatTime(elapsedSec)} />
          <StatRow icon={<BookOpen className="h-4 w-4" />} label="Words Saved" value={String(wordsSavedCount)} />
          <StatRow icon={<ListChecks className="h-4 w-4" />} label="Questions" value={String(total)} />
          <StatRow icon={<Bookmark className="h-4 w-4" />} label="Bookmarks" value={String(bookmarksCount)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h3 className="text-sm font-semibold">Your Progress</h3>
          <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
            <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
              <circle cx="64" cy="64" r={R} fill="none" strokeWidth="10" className="stroke-muted" />
              <circle
                cx="64"
                cy="64"
                r={R}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-primary transition-all"
                strokeDasharray={`${dash} ${C}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{donutPercent}%</span>
              <span className="text-xs text-muted-foreground">of {total}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Answered</span>
            <span className="font-medium text-foreground">{answeredExcludingCurrent}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Current</span>
            <span className="font-medium text-foreground">1</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/40" /> Unanswered</span>
            <span className="font-medium text-foreground">{unansweredExcludingCurrent}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Question Navigator</h3>
          <div className="grid grid-cols-4 gap-2">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onNavigate(i);
                  setMobileNavOpen(false);
                }}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                  i === currentIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : isAnswered(i)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-muted-foreground/30 text-muted-foreground hover:bg-accent"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-muted/30">
      {/* Left sidebar - desktop only (sm+). Below sm it's replaced by the
          slide-in drawer below, opened via the menu button in the main
          panel's header - without it, mobile users stuck in this fullscreen
          quiz overlay had no progress feedback or question-jump at all. */}
      <div className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-background p-5 sm:flex">
        {sidebarPanel}
      </div>

      {/* Mobile drawer version of the same panel */}
      <div className={cn("fixed inset-0 z-10 sm:hidden", !mobileNavOpen && "pointer-events-none")} aria-hidden={!mobileNavOpen}>
        <div
          className={cn("absolute inset-0 bg-black/40 transition-opacity", mobileNavOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setMobileNavOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r bg-background p-5 shadow-xl transition-transform duration-200",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarPanel}
        </div>
      </div>

      {/* Main question panel */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-10 bg-background">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Show progress/navigator"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-md border p-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
              >
                <ListChecks className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-bold">
                Question {currentIndex + 1} <span className="font-normal text-muted-foreground">of {total}</span>
              </h1>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onExit}>
              <LogOut className="h-4 w-4" /> Exit
            </Button>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
          </div>

          {current && (
            <Card>
              <CardContent className="space-y-4 p-6 sm:p-8">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  Q{currentIndex + 1}
                </span>

                <h2 className="text-xl font-bold sm:text-2xl">{current.prompt}</h2>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <badge.icon className="h-3.5 w-3.5" /> {badge.label}
                </span>

                <div className="space-y-2.5 pt-1">
                  {current.type === "MATCHING" && current.pairs ? (
                    <MatchingQuestion pairs={current.pairs} value={answers[currentIndex]} onChange={(v) => onAnswer(currentIndex, v)} />
                  ) : current.type === "ORDERING" && current.items ? (
                    <OrderingQuestion items={current.items} value={answers[currentIndex]} onChange={(v) => onAnswer(currentIndex, v)} />
                  ) : current.options.length > 0 ? (
                    current.options.map((opt, i) => {
                      const selected = answers[currentIndex] === opt;
                      const letter = String.fromCharCode(65 + i);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => onAnswer(currentIndex, opt)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left text-sm font-medium transition-colors",
                            selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                              selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                            )}
                          >
                            {letter}
                          </span>
                          {opt}
                        </button>
                      );
                    })
                  ) : (
                    <Input
                      value={answers[currentIndex] ?? ""}
                      onChange={(e) => onAnswer(currentIndex, e.target.value)}
                      placeholder="Your answer..."
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => onNavigate(Math.min(total - 1, currentIndex + 1))}
              disabled={currentIndex >= total - 1}
            >
              Next Question <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TranslationBox({
  value,
  onChange,
  checked,
  onCheck,
  reference,
}: {
  value: string;
  onChange: (v: string) => void;
  checked: boolean;
  onCheck: () => void;
  reference?: string;
}) {
  return (
    <>
      <textarea
        className="h-32 w-full rounded-md border p-3 text-sm"
        placeholder="Read, then write your translation here..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={checked}
      />
      {!checked ? (
        <Button className="w-full" onClick={onCheck} disabled={!value.trim()}>
          Check
        </Button>
      ) : (
        <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Reference Translation
          </p>
          <p className="whitespace-pre-line">{reference}</p>
        </div>
      )}
    </>
  );
}

function QuestionsBox({
  questions,
  currentIndex,
  onNavigate,
  answers,
  onAnswer,
}: {
  questions: ReadingQuestion[];
  currentIndex: number;
  onNavigate: (i: number) => void;
  answers: Record<number, string>;
  onAnswer: (i: number, value: string) => void;
}) {
  const total = questions.length;
  const current = questions[currentIndex];
  const isAnswered = (i: number) => !!answers[i]?.trim();

  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onNavigate(i)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
              i === currentIndex
                ? "border-primary bg-primary text-primary-foreground"
                : isAnswered(i)
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted-foreground/30 text-muted-foreground hover:bg-accent",
            )}
          >
            {isAnswered(i) && i !== currentIndex ? (
              <Check className="h-4 w-4" />
            ) : (
              i + 1
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Answered
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Current
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/40" />{" "}
          Unanswered
        </span>
      </div>

      {current && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Question {currentIndex + 1}
          </p>
          <p className="text-sm font-medium">{current.prompt}</p>
          <div className="space-y-1.5">
            {current.type === "MATCHING" && current.pairs ? (
              <MatchingQuestion
                pairs={current.pairs}
                value={answers[currentIndex]}
                onChange={(v) => onAnswer(currentIndex, v)}
              />
            ) : current.type === "ORDERING" && current.items ? (
              <OrderingQuestion
                items={current.items}
                value={answers[currentIndex]}
                onChange={(v) => onAnswer(currentIndex, v)}
              />
            ) : current.options.length > 0 ? (
              current.options.map((opt) => {
                const selected = answers[currentIndex] === opt;
                const isCorrectOpt = opt === current.answer;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onAnswer(currentIndex, opt)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selected && isCorrectOpt
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : selected
                          ? "border-destructive bg-destructive/5"
                          : "hover:bg-accent",
                    )}
                  >
                    {opt}
                    {selected && isCorrectOpt && (
                      <Check className="h-4 w-4 text-emerald-600" />
                    )}
                    {selected && !isCorrectOpt && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </button>
                );
              })
            ) : (
              <Input
                value={answers[currentIndex] ?? ""}
                onChange={(e) => onAnswer(currentIndex, e.target.value)}
                placeholder="Your answer..."
              />
            )}
          </div>
        </div>
      )}

      <Button
        className="w-full"
        variant="outline"
        onClick={() => onNavigate(Math.min(currentIndex + 1, total - 1))}
        disabled={currentIndex >= total - 1}
      >
        {currentIndex >= total - 1 ? "Last Question" : "Next Question"}
      </Button>
    </>
  );
}

function MatchingQuestion({
  pairs,
  value,
  onChange,
}: {
  pairs: { left: string; right: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const shuffledRights = useMemo(
    () => [...pairs.map((p) => p.right)].sort(() => Math.random() - 0.5),
    [pairs],
  );
  let selections: string[] = [];
  try {
    const parsed = value ? JSON.parse(value) : [];
    if (Array.isArray(parsed)) selections = parsed;
  } catch {
    /* ignore */
  }
  while (selections.length < pairs.length) selections.push("");

  function setSelection(i: number, right: string) {
    const next = [...selections];
    next[i] = right;
    onChange(JSON.stringify(next));
  }

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-1/2 rounded-md border bg-accent/30 px-2.5 py-1.5 text-sm">
            {p.left}
          </span>
          <select
            className="w-1/2 rounded-md border bg-background px-2 py-1.5 text-sm"
            value={selections[i] ?? ""}
            onChange={(e) => setSelection(i, e.target.value)}
          >
            <option value="">- เลือกคู่ -</option>
            {shuffledRights.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingQuestion({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  let order: string[] = [];
  try {
    const parsed = value ? JSON.parse(value) : null;
    order =
      Array.isArray(parsed) && parsed.length === items.length
        ? parsed
        : [...items].sort(() => Math.random() - 0.5);
  } catch {
    order = [...items].sort(() => Math.random() - 0.5);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(JSON.stringify(next));
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">เรียงลำดับให้ถูกต้อง</p>
      {order.map((it, i) => (
        <div
          key={it + i}
          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {i + 1}.
          </span>
          <span className="flex-1">{it}</span>
          <button
            onClick={() => move(i, -1)}
            disabled={i === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={() => move(i, 1)}
            disabled={i === order.length - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}

function VocabularyBox({
  words,
  onRemove,
}: {
  words: { id: string; headword: string }[];
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {words.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Double-click a word while reading to add it here.
        </p>
      ) : (
        <div className="space-y-1.5">
          {words.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm"
            >
              <span className="capitalize">{w.headword}</span>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <button
                  onClick={() => speak(w.headword)}
                  className="hover:text-foreground"
                  title="Pronounce"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onRemove(w.id)}
                  className="hover:text-destructive"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link to="/vocabulary?collectionId=ALL_WORDS">View All</Link>
      </Button>
    </>
  );
}

function GrammarBox({
  query,
}: {
  query: {
    isLoading: boolean;
    data?: { points: GrammarPoint[]; note?: string };
  };
}) {
  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">กำลังวิเคราะห์...</p>;
  const points = query.data?.points ?? [];
  if (!points.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {query.data?.note ?? "ไม่พบจุดไวยากรณ์ที่เด่นชัดในบทความนี้"}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {points.map((p, i) => (
        <div key={i} className="space-y-1 rounded-md border p-2.5 text-sm">
          <p className="font-semibold text-primary">{p.title}</p>
          <p className="text-muted-foreground">{p.explanation}</p>
          {p.example && <p className="italic">"{p.example}"</p>}
        </div>
      ))}
    </div>
  );
}

function BottomToolButton({
  icon,
  label,
  onClick,
  disabled,
  badge,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-primary",
      )}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className="text-[10px] font-normal text-muted-foreground/70">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ToolbarBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {icon}
    </button>
  );
}

function ExplainField({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
