// Listening practice UI for a *stored* Article (shared with Reading - a
// listening exercise is just a passage played back via TTS instead of read
// on screen). Play/pause/replay + translation-or-questions practice, plus a
// scoped-down port of ReadingWorkspace's bottom toolbar: Highlight/Eraser
// apply to the Guided mode question/options text (see QuestionStage), and
// Note is a real floating, draggable, resizable, DB-backed window (text-only
// - no draw/erase canvas layer like Reading's, to keep this deliverable
// focused).
//
// Playback is real server-generated MP3 (Kokoro TTS for English, Microsoft
// Edge Neural TTS for every other language - see api/hooks.ts's
// useGenerateAudio and apps/server/src/tts/*), not the browser's Web Speech
// API. A single hidden <audio> element is the actual playback engine; the
// Play/Pause/Replay buttons and speed pills just drive it. Changing speed
// re-requests audio at the new rate (baked in server-side, cached after the
// first time) rather than changing the browser's own playback rate, so
// prosody/pacing stays natural instead of a naive pitch-preserved speedup.
//
// Before the actual practice, the learner goes through two extra phases:
//   1. "setup"  - a popup asking mode-specific questions (which language
//      they'll type their translation in, or whether they want the
//      questions shown as text vs. purely by ear, plus whether practice
//      starts automatically or waits for them to press Start).
//   2. "intro"  - a spoken + written preamble ("You will hear...") that
//      explains what's about to happen, ending in a Start Practice button.
// Only after that does the familiar play/translate/answer UI ("practice"
// phase) appear. Articles with neither translation nor questions attached
// skip straight to "practice" since there's nothing to configure.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Play, Pause, RotateCcw, RotateCw, ChevronDown, Heart, Pencil, Headphones, Volume2, VolumeX,
  CheckCircle2, XCircle, Share2, Star, Loader2, Clock, ListChecks, BookOpen,
  Highlighter, Eraser, StickyNote, MoreHorizontal, GripHorizontal, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  usePassage, useUpdatePassage, useToggleLike, useSubmitListeningAttempt, useSubmitRating,
  useGenerateAudio, useCreateHighlight, useDeleteHighlight, useCreateNote, useUpdateNote,
  type ReadingQuestion, type HighlightItem,
} from "@/api/hooks";
import { resolveAudioUrl } from "@/api/client";
import { ALLOWED_SPEEDS, DEFAULT_SPEED, type Accent, type VoiceGender, type TTSSpeed } from "@/lib/ttsLanguages";
import { cn } from "@/lib/utils";

interface Props {
  articleId: string;
  title: string;
  transcript: string;
  translation?: string | null;
  questions?: ReadingQuestion[] | null;
  testMode: string;
  metaLine?: string;
  onBack: () => void;
  /** Community/browse mode: viewer isn't the owner - show like/publish-state read-only. */
  readOnly?: boolean;
  /** Language/accent/voice/speed picked in the Generate wizard, if this came straight from generation. Missing -> English/American/Female/1.0x (see tts.config.ts's backward-compat rules). */
  initialLanguage?: string;
  initialAccent?: Accent;
  initialGender?: VoiceGender;
  initialSpeed?: TTSSpeed;
}

const TRANSLATE_LANGUAGES = [
  "Thai", "English", "Japanese", "Korean", "Chinese", "Vietnamese", "French", "German", "Spanish", "Indonesian",
];

// ---- Ported (scoped down) from ReadingWorkspace: Highlight/Eraser engine for
// the Guided-mode question/options text - see QuestionStage below. ----
const HIGHLIGHT_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fdba74"];

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

function highlightCursor(color: string): string {
  const fill = color.replace("#", "%23");
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
    `%3Crect x='2' y='2' width='16' height='16' rx='4' fill='${fill}' stroke='%23334155' stroke-width='1.5'/%3E%3C/svg%3E`;
  return `url("data:image/svg+xml,${svg}") 2 18, crosshair`;
}

function eraserCursor(): string {
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
    `%3Ccircle cx='10' cy='10' r='8' fill='none' stroke='%23ef4444' stroke-width='2'/%3E` +
    `%3Cline x1='5' y1='5' x2='15' y2='15' stroke='%23ef4444' stroke-width='2'/%3E%3C/svg%3E`;
  return `url("data:image/svg+xml,${svg}") 10 10, pointer`;
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9'’-]/.test(ch);
}

function snapRangeToWords(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s > 0 && isWordChar(text[s - 1]) && isWordChar(text[s])) s--;
  while (e < text.length && isWordChar(text[e - 1]) && isWordChar(text[e])) e++;
  return { start: s, end: e };
}

/** Is this question's answer choices rendered as clickable option buttons? (mirrors QuestionStage's own check) */
function isChoiceQuestion(q: ReadingQuestion): boolean {
  return ["MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN"].includes(q.type) && (q.options?.length ?? 0) > 0;
}

/** The exact lines shown on screen for a question in Guided mode - prompt first, then each answer choice (only choices actually visible as raw text in Guided mode; Pure mode shows letters only, nothing to highlight there). Highlight offsets are always computed against this same, deterministic composite so they stay valid across re-renders. */
function guidedCompositeLines(q: ReadingQuestion): string[] {
  return [q.prompt, ...(isChoiceQuestion(q) ? q.options : [])];
}
function guidedCompositeText(q: ReadingQuestion): string {
  return guidedCompositeLines(q).join("\n");
}

type Phase = "setup" | "intro" | "practice";
type PlayState = "idle" | "loading" | "playing" | "paused";
// Which logical audio clip is currently loaded into the single shared
// <audio> element - lets each AudioPlayerCard know whether the live
// currentTime/duration/play-state actually belongs to it (vs. some other
// card, or a one-off clip like the spoken intro/instruction that has no
// card of its own).
type TrackKey = "ARTICLE" | "QUESTION_OPTIONS" | null;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Session-elapsed-time formatter (m:ss, no leading zero on minutes) - matches the "Reading Time" stat's format in ReadingWorkspace's sidebar, reused here for "Reading Time" under Listening Progress. */
function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ListeningWorkspace({
  articleId, title, transcript, translation, questions, testMode, metaLine, onBack, readOnly,
  initialLanguage, initialAccent, initialGender, initialSpeed,
}: Props) {
  const { data: saved } = usePassage(articleId);
  const updatePassage = useUpdatePassage();
  const toggleLike = useToggleLike();
  const submitAttempt = useSubmitListeningAttempt();
  const submitRating = useSubmitRating();
  const generateAudio = useGenerateAudio();
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const showQuestions = (testMode === "QUESTIONS" || testMode === "MIXED") && !!questions?.length;
  const showTranslation = testMode === "TRANSLATION";

  const [language] = useState(initialLanguage ?? "en");
  const [accent] = useState<Accent>(initialAccent ?? "AMERICAN");
  const [gender] = useState<VoiceGender>(initialGender ?? "FEMALE");
  const [speed, setSpeed] = useState<TTSSpeed>(initialSpeed ?? DEFAULT_SPEED);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const audioRef = useRef<HTMLAudioElement>(null);

  const [userTranslation, setUserTranslation] = useState("");
  const [translationChecked, setTranslationChecked] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false);
  const [questionsChecked, setQuestionsChecked] = useState(false);

  // ---- Pre-practice setup/intro ----
  const [phase, setPhase] = useState<Phase>(showTranslation || showQuestions ? "setup" : "practice");
  const [targetLang, setTargetLang] = useState("Thai");
  // "เห็นคำถาม" (Guided - only the article is audio-only, questions/choices stay
  // on screen as text) vs "ฟังทั้งหมด" (Pure - article, questions, AND choices
  // are all audio-only; only answer letters/an input box are ever shown).
  const [listenMode, setListenMode] = useState<"GUIDED" | "PURE">("GUIDED");
  // "อัตโนมัติ" (Auto - article -> instruction -> each question's prompt then
  // choices, fully timed/automatic, no button presses needed) vs "ไปต่อเมื่อพร้อม"
  // (Self-Paced - the learner presses a separate Play button per part, replays
  // freely, and advances to the next question manually).
  const [pacingMode, setPacingMode] = useState<"AUTO" | "SELF_PACED">("AUTO");
  const [currentQ, setCurrentQ] = useState(0);
  const [autoFlowDone, setAutoFlowDone] = useState(false);
  const [nowPlayingPart, setNowPlayingPart] = useState<"ARTICLE" | "INSTRUCTION" | "QUESTION" | "OPTIONS" | null>(null);
  const introSpokenRef = useRef(false);
  const autoFlowStartedRef = useRef(false);
  const cancelledRef = useRef(false);
  // Resetting to false in the effect body (not just the initial useRef(false))
  // matters under React's StrictMode: in dev, StrictMode mounts every
  // component, immediately fires all cleanups once as a "did you clean up
  // properly?" probe, then mounts again for real - without this reset, that
  // probe cleanup would set cancelledRef.current = true and nothing would
  // ever set it back, so every `if (cancelledRef.current) return;` guard in
  // runAutoFlow/runPureAutoFlow/playTextAndWait etc. would bail out on its
  // very first check, silently killing the whole flow right after Article
  // (exactly what "finished the article, then nothing happened" looks like).
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Pure Audio Mode + Auto pacing's countdown UI ("The questions are about to
  // begin in Ns" / "Please answer the question in Ns" / "Time is running out
  // in Ns") - see runPureAutoFlow. countdownPhase gates the manual skip
  // button, which is only offered during the 60s answer window.
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [countdownPhase, setCountdownPhase] = useState<"LEAD_IN" | "ANSWER" | null>(null);
  const countdownSkipRef = useRef<(() => void) | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  // ---- Audio player chrome (progress bar, ±10s skip, speed, volume) ----
  // Shared by every AudioPlayerCard - see the "reuse Reading workspace's
  // conventions" ask: one real <audio> element drives playback, cards just
  // reflect its time/duration/volume and know whether *they* are the track
  // currently loaded into it via `activeTrack`.
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [activeTrack, setActiveTrack] = useState<TrackKey>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // "Reading Time" stat in the Listening Progress sidebar - same
  // startedAt/setInterval pattern as ReadingWorkspace's elapsedSec.
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  // ---- Highlight/Eraser (Guided mode's question/options text only) ----
  // "Highlighter pen" mode: toggled from the bottom toolbar. While active, a
  // text selection inside the Guided-mode question/options box is painted
  // immediately (no floating toolbar step). Eraser mode is mutually
  // exclusive - clicking (or dragging over) highlighted text removes it.
  const [highlightMode, setHighlightMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [penColor, setPenColor] = useState(HIGHLIGHT_COLORS[0]);
  const highlights = saved?.highlights ?? [];
  const currentQuestionHighlights = highlights.filter((h) => h.questionIndex === currentQ);

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

  function handleCreateQuestionHighlight(text: string, start: number, end: number) {
    createHighlight.mutate({ articleId, text, startOffset: start, endOffset: end, color: penColor, questionIndex: currentQ });
  }

  function handleRemoveHighlight(id: string) {
    deleteHighlight.mutate({ id, articleId });
  }

  // Mirrors ReadingWorkspace's eraseRange: deletes any highlight(s) the erased
  // span overlaps, recreating a trimmed left/right remainder for any that were
  // only partly covered.
  function handleEraseQuestionRange(eraseStart: number, eraseEnd: number) {
    const q = questions?.[currentQ];
    if (!q) return;
    const full = guidedCompositeText(q);
    currentQuestionHighlights
      .filter((h) => h.startOffset < eraseEnd && h.endOffset > eraseStart)
      .forEach((h) => {
        deleteHighlight.mutate({ id: h.id, articleId });
        if (h.startOffset < eraseStart) {
          createHighlight.mutate({
            articleId, text: full.slice(h.startOffset, eraseStart),
            startOffset: h.startOffset, endOffset: eraseStart, color: h.color, questionIndex: currentQ,
          });
        }
        if (h.endOffset > eraseEnd) {
          createHighlight.mutate({
            articleId, text: full.slice(eraseEnd, h.endOffset),
            startOffset: eraseEnd, endOffset: h.endOffset, color: h.color, questionIndex: currentQ,
          });
        }
      });
  }

  // ---- Floating Note tool (bottom toolbar's "Note" button) ----
  // Text-only port of ReadingWorkspace's Note box (no draw/erase canvas
  // layer): a single freeform, per-article scratchpad note, draggable and
  // resizable, autosaved to the same Note model Reading uses (plain text -
  // already the backward-compatible format Reading's own note box falls back
  // to for pre-drawing rows, so it's safe to share).
  const scratchNote = (saved?.notes ?? []).find((n) => !n.anchorText) ?? null;
  const [noteBox, setNoteBox] = useState<{ id: string | null; draft: string } | null>(null);
  const [noteBoxPos, setNoteBoxPos] = useState({ x: 24, y: 96 });
  const [noteBoxSize, setNoteBoxSize] = useState({ width: 320, height: 320 });
  const noteDragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const noteResizeRef = useRef({ resizing: false, startX: 0, startY: 0, origW: 0, origH: 0 });
  const noteAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteCreatePendingRef = useRef(false);
  const noteBoxRef = useRef(noteBox);
  useEffect(() => {
    noteBoxRef.current = noteBox;
  }, [noteBox]);

  const NOTE_BOX_MIN_WIDTH = 260;
  const NOTE_BOX_MIN_HEIGHT = 200;

  function openNoteBox() {
    setNoteBoxPos({ x: Math.max(16, window.innerWidth - 360), y: 96 });
    setNoteBox({ id: scratchNote?.id ?? null, draft: scratchNote?.text ?? "" });
  }

  function closeNoteBox() {
    if (noteAutosaveTimerRef.current) clearTimeout(noteAutosaveTimerRef.current);
    setNoteBox(null);
  }

  function scheduleNoteAutosave() {
    if (noteAutosaveTimerRef.current) clearTimeout(noteAutosaveTimerRef.current);
    noteAutosaveTimerRef.current = setTimeout(autosaveNote, 500);
  }

  function autosaveNote() {
    // Reads from a ref (not the setNoteBox updater) - React 18 StrictMode
    // double-invokes state updater functions in dev, which would otherwise
    // fire mutate() twice per autosave tick.
    const current = noteBoxRef.current;
    if (!current) return;
    if (!current.draft.trim()) return; // nothing to save yet
    if (current.id) {
      updateNote.mutate({ id: current.id, articleId, text: current.draft });
      return;
    }
    if (noteCreatePendingRef.current) {
      scheduleNoteAutosave();
      return;
    }
    noteCreatePendingRef.current = true;
    createNote.mutate(
      { articleId, text: current.draft },
      {
        onSuccess: (created) => {
          noteCreatePendingRef.current = false;
          setNoteBox((prev) => (prev ? { ...prev, id: created.id } : prev));
        },
        onError: () => {
          noteCreatePendingRef.current = false;
        },
      }
    );
  }

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

  function handleNoteResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    noteResizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, origW: noteBoxSize.width, origH: noteBoxSize.height };
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

  function toggleMute() {
    setVolume((v) => (v > 0 ? 0 : 1));
  }

  function skip(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : audio.currentTime + Math.max(deltaSeconds, 0);
    audio.currentTime = Math.min(Math.max(audio.currentTime + deltaSeconds, 0), max);
  }

  function seekTo(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }

  // Guards playStoredUrl/playText against out-of-order responses: text-to-
  // speech generation time scales with text length, so a *slower* older
  // request (e.g. the full Article) can resolve *after* a newer, shorter one
  // (e.g. Question/Options) that the learner already switched to - without
  // this, the stale response's onSuccess still fires and silently swaps
  // audio.src back to the old clip mid-playback ("Question/Options keeps
  // playing the Article"). Each call stamps its own id; a response only gets
  // applied if no newer play request has started since.
  const playRequestIdRef = useRef(0);

  /** Plays an already-generated MP3 URL directly - no /listening/audio round trip. Used for the OCR import wizard's pre-generated tracks (see Article.audioUrl/articleAudioUrl/questionsAudioUrl/choicesAudioUrl). */
  function playStoredUrl(url: string, track: TrackKey = null) {
    const audio = audioRef.current;
    if (!audio) return;
    const requestId = ++playRequestIdRef.current;
    setPlayState("loading");
    setActiveTrack(track);
    audio.src = resolveAudioUrl(url);
    audio.play().catch(() => {
      if (playRequestIdRef.current === requestId) setPlayState("idle");
    });
  }

  /** Fetches (or reuses cached) MP3 for `text` at the current language/accent/gender/speed and plays it through the shared hidden <audio> element. */
  function playText(text: string, speedOverride?: TTSSpeed, track: TrackKey = null) {
    const requestId = ++playRequestIdRef.current;
    setPlayState("loading");
    setActiveTrack(track);
    generateAudio.mutate(
      { text, language, accent, gender, speed: speedOverride ?? speed },
      {
        onSuccess: (res) => {
          if (playRequestIdRef.current !== requestId) return; // superseded - a newer play request already took over
          const audio = audioRef.current;
          if (!audio) return;
          audio.src = resolveAudioUrl(res.url);
          audio.play().catch(() => setPlayState("idle"));
        },
        onError: () => {
          if (playRequestIdRef.current !== requestId) return;
          setPlayState("idle");
        },
      }
    );
  }

  // Pre-generated audio (Import ReadingBook/Image wizard) was synthesized at
  // the server's default voice/speed - only usable as a direct-play shortcut
  // while the learner is still at that same default; a different speed still
  // falls back to live generation exactly as before.
  function playFromStart(track: TrackKey = "ARTICLE") {
    if (speed === DEFAULT_SPEED && saved?.articleAudioUrl) {
      playStoredUrl(saved.articleAudioUrl, track);
      return;
    }
    playText(transcript, undefined, track);
  }

  /** Builds the "Question / Options" card's clip - Instruction + this question's prompt + its answer choices, read together as one clip so replaying it always gives full context (Pure mode has nothing else on screen to remind the learner what they're supposed to be doing). */
  function buildQuestionOptionsText(q: ReadingQuestion): string {
    return `${instructionText()} ${q.prompt} ${buildOptionsText(q)}`.trim();
  }

  /** Starts (from the top) whichever clip `track` refers to - the Article passage, or the current question's Instruction + prompt + answer choices. */
  function startTrack(track: TrackKey) {
    if (track === "ARTICLE") {
      playFromStart("ARTICLE");
      return;
    }
    if (track === "QUESTION_OPTIONS") {
      const q = questions?.[currentQ];
      if (!q) return;
      // Pregenerated during OCR import's "AI is Processing" step (see
      // Article.questionAudioUrls) - only usable at the server's default
      // speed, same rule as the Article's own fast path.
      const storedUrl = speed === DEFAULT_SPEED ? saved?.questionAudioUrls?.[currentQ] : null;
      if (storedUrl) {
        playStoredUrl(storedUrl, "QUESTION_OPTIONS");
        return;
      }
      playText(buildQuestionOptionsText(q), undefined, "QUESTION_OPTIONS");
    }
  }

  /** AudioPlayerCard's play/pause button: resumes/pauses in place if this card's track is already loaded, otherwise starts it fresh from the top. */
  function handleCardPlayPause(track: TrackKey) {
    const audio = audioRef.current;
    if (audio && activeTrack === track) {
      if (playState === "playing") {
        audio.pause();
        setPlayState("paused");
        return;
      }
      if (playState === "paused") {
        audio.play();
        setPlayState("playing");
        return;
      }
    }
    startTrack(track);
  }

  function changeSpeed(next: TTSSpeed) {
    setSpeed(next);
    // Speed is baked into the audio server-side, so a change mid-playback
    // means re-fetching (instant once cached) and restarting from the top -
    // there's no in-place "speed up this exact moment" the way a client-side
    // playbackRate trick would allow. Restart whichever track was actually
    // active so the speed change applies to what the learner is listening to.
    if (playState !== "playing" && playState !== "paused") return;
    if (activeTrack === "QUESTION_OPTIONS") {
      const q = questions?.[currentQ];
      if (!q) return;
      const storedUrl = next === DEFAULT_SPEED ? saved?.questionAudioUrls?.[currentQ] : null;
      if (storedUrl) playStoredUrl(storedUrl, "QUESTION_OPTIONS");
      else playText(buildQuestionOptionsText(q), next, "QUESTION_OPTIONS");
      return;
    }
    if (next === DEFAULT_SPEED && saved?.articleAudioUrl) playStoredUrl(saved.articleAudioUrl, activeTrack ?? "ARTICLE");
    else playText(transcript, next, activeTrack ?? "ARTICLE");
  }

  // ---- Sequenced playback (Questions flow) ----
  // Everything below awaits actual playback completion (the shared <audio>
  // element's "ended" event), so the Auto pacing mode can chain
  // article -> instruction -> per-question prompt/choices with real timed
  // gaps between each, instead of firing them all at once.

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * A visible, second-by-second countdown (Pure + Auto's "about to begin" /
   * "answer the question" prompts) - ticks `countdownText` down via
   * `buildLabel`, then resolves once it hits 0. `countdownSkipRef` holds a
   * "finish now" callback for the whole time it's running, so the manual
   * skip button (answer phase only) can resolve it immediately instead of
   * waiting for the next 1s tick.
   */
  function runCountdown(totalSeconds: number, buildLabel: (remaining: number) => string, phase: "LEAD_IN" | "ANSWER"): Promise<void> {
    return new Promise((resolve) => {
      let remaining = totalSeconds;
      setCountdownPhase(phase);
      setCountdownText(buildLabel(remaining));

      const finish = () => {
        clearInterval(interval);
        countdownSkipRef.current = null;
        setCountdownText(null);
        setCountdownPhase(null);
        resolve();
      };

      const interval = setInterval(() => {
        if (cancelledRef.current) {
          finish();
          return;
        }
        remaining -= 1;
        if (remaining <= 0) {
          finish();
          return;
        }
        setCountdownText(buildLabel(remaining));
      }, 1000);

      countdownSkipRef.current = finish;
    });
  }

  /** Manual "next question" during Pure + Auto's 60s answer countdown - ends the wait immediately instead of at 0. No-op outside a running countdown. */
  function skipCountdown() {
    countdownSkipRef.current?.();
  }

  function playUrlAndWait(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) return resolve();
      const done = () => {
        audio.removeEventListener("ended", done);
        audio.removeEventListener("error", done);
        resolve();
      };
      audio.addEventListener("ended", done);
      audio.addEventListener("error", done);
      setPlayState("loading");
      audio.src = resolveAudioUrl(url);
      audio.play().catch(done);
    });
  }

  /** Generates (or reuses cached) audio for `text` and awaits full playback. No-op for blank text. */
  async function playTextAndWait(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const res = await generateAudio.mutateAsync({ text: trimmed, language, accent, gender, speed });
    if (cancelledRef.current) return;
    await playUrlAndWait(res.url);
  }

  async function playArticleAndWait(): Promise<void> {
    if (speed === DEFAULT_SPEED && saved?.articleAudioUrl) await playUrlAndWait(saved.articleAudioUrl);
    else await playTextAndWait(transcript);
  }

  const DEFAULT_INSTRUCTION_TEXT = "Listen carefully, then answer the questions based on what you heard.";
  function instructionText(): string {
    return saved?.description?.trim() || DEFAULT_INSTRUCTION_TEXT;
  }

  /** Auto flow's Instruction step - same pregenerated-fast-path/live-fallback pattern as playArticleAndWait, using Article.instructionAudioUrl. */
  async function playInstructionAndWait(): Promise<void> {
    if (speed === DEFAULT_SPEED && saved?.instructionAudioUrl) await playUrlAndWait(saved.instructionAudioUrl);
    else await playTextAndWait(instructionText());
  }

  function buildOptionsText(q: ReadingQuestion): string {
    const letters = ["A", "B", "C", "D", "E", "F"];
    if (!q.options?.length) return "";
    return q.options.map((opt, i) => `${letters[i] ?? i + 1}. ${opt}`).join(". ");
  }

  // Auto pacing mode's whole timeline, run once when practice starts:
  // article -> wait 4s -> instruction (once) -> wait 2s -> for each question:
  // prompt -> wait 3s -> choices -> wait 5s -> next question.
  async function runAutoFlow() {
    if (!questions?.length) return;
    setAutoFlowDone(false);
    setCurrentQ(0);

    setNowPlayingPart("ARTICLE");
    setActiveTrack("ARTICLE"); // lets the (view-only) Article AudioPlayerCard show live progress
    await playArticleAndWait();
    if (cancelledRef.current) return;
    await wait(4000);
    if (cancelledRef.current) return;

    setNowPlayingPart("INSTRUCTION");
    setActiveTrack(null); // spoken instruction has no card of its own
    await playInstructionAndWait();
    if (cancelledRef.current) return;
    await wait(2000);
    if (cancelledRef.current) return;

    for (let i = 0; i < questions.length; i++) {
      if (cancelledRef.current) return;
      setCurrentQ(i);

      setNowPlayingPart("QUESTION");
      setActiveTrack("QUESTION_OPTIONS"); // prompt and choices share the one "Question / Options" card
      await playTextAndWait(questions[i].prompt);
      if (cancelledRef.current) return;
      await wait(3000);
      if (cancelledRef.current) return;

      setNowPlayingPart("OPTIONS");
      setActiveTrack("QUESTION_OPTIONS");
      await playTextAndWait(buildOptionsText(questions[i]));
      if (cancelledRef.current) return;
      await wait(5000);
      if (cancelledRef.current) return;
    }

    setNowPlayingPart(null);
    setActiveTrack(null);
    setAutoFlowDone(true);
  }

  /** Awaits full playback of the combined "Instruction + prompt + choices" clip for question `index` - always live-generated (no pregenerated per-question track; see reading.ts's generateBookImportAudio for why), cached server-side afterward. */
  async function playQuestionOptionsAndWait(index: number): Promise<void> {
    const q = questions?.[index];
    if (!q) return;
    await playTextAndWait(buildQuestionOptionsText(q));
  }

  // Pure Audio Mode + Auto pacing's own timeline (distinct from runAutoFlow
  // above, which still drives every other Listening/Pacing combination):
  // article -> once, a 5s "about to begin" countdown -> for each question,
  // play its combined Question/Options clip -> a 60s "answer the question"
  // countdown (text switches to "time is running out" inside the last 10s;
  // ends early if the learner presses the manual skip button) -> straight
  // into the next question's clip, no repeated lead-in countdown.
  async function runPureAutoFlow() {
    if (!questions?.length) return;
    setAutoFlowDone(false);
    setCurrentQ(0);

    setNowPlayingPart("ARTICLE");
    setActiveTrack("ARTICLE");
    await playArticleAndWait();
    if (cancelledRef.current) return;

    setNowPlayingPart(null);
    setActiveTrack(null);
    await runCountdown(5, (r) => `The questions are about to begin in ${r}s`, "LEAD_IN");
    if (cancelledRef.current) return;

    for (let i = 0; i < questions.length; i++) {
      if (cancelledRef.current) return;
      setCurrentQ(i);

      setNowPlayingPart("QUESTION");
      setActiveTrack("QUESTION_OPTIONS");
      await playQuestionOptionsAndWait(i);
      if (cancelledRef.current) return;

      setNowPlayingPart(null);
      await runCountdown(
        60,
        (r) => (r <= 10 ? `Time is running out in ${r}s` : `Please answer the question in ${r}s`),
        "ANSWER"
      );
      if (cancelledRef.current) return;
    }

    setNowPlayingPart(null);
    setActiveTrack(null);
    setAutoFlowDone(true);
  }

  function goToNextQuestion() {
    if (!questions?.length) return;
    // The Question/Options card's audio belongs to the question we're
    // leaving - stop it and clear activeTrack so the next question's card
    // starts clean instead of showing stale progress/duration.
    audioRef.current?.pause();
    setActiveTrack(null);
    setPlayState("idle");
    if (currentQ < questions.length - 1) setCurrentQ((i) => i + 1);
    else submitAnswers();
  }

  /** Question Navigator's free-jump - Self-Paced only (Auto's navigator is view-only, matching its non-interactive player cards). */
  function jumpToQuestion(i: number) {
    if (!questions?.length) return;
    audioRef.current?.pause();
    setActiveTrack(null);
    setPlayState("idle");
    setCurrentQ(i);
  }

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
    submitAttempt.mutate({ correctCount: 1, totalCount: 1 });
  }

  function submitAnswers() {
    setQuestionsSubmitted(true);
    const { correct, total } = gradeQuestions();
    submitAttempt.mutate({ correctCount: correct, totalCount: total || 1 });
  }

  function buildIntroText(): string {
    if (showTranslation) {
      return `You will hear an English word, phrase, or sentence.\nListen carefully and type the ${targetLang} translation.\n\nWhen you are ready, let's begin.`;
    }
    if (showQuestions) {
      const modeLine = listenMode === "PURE"
        ? "The article, questions, and answer choices will all stay hidden - listen carefully to everything, then pick your answer."
        : "You will hear the article read aloud. The questions and answer choices will stay on screen for you to read.";
      const pacingLine = pacingMode === "AUTO"
        ? "Playback is fully automatic - just listen and select your answers as each question plays."
        : "Press play for each part whenever you're ready, then move to the next question yourself.";
      return `${modeLine}\n${pacingLine}\n\nWhen you are ready, let's begin.`;
    }
    return "";
  }

  // Speak the intro exactly once when it appears (ref guard survives
  // StrictMode's dev-only double-invoke of effects).
  useEffect(() => {
    if (phase !== "intro" || introSpokenRef.current) return;
    introSpokenRef.current = true;
    playText(buildIntroText());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // "อัตโนมัติ" (Auto) pacing runs its whole timeline itself as soon as
  // practice begins - Pure Audio Mode uses its own article -> countdown ->
  // per-question flow (runPureAutoFlow), everything else (Guided) still uses
  // the original article -> instruction -> per-question prompt/choices timing
  // (runAutoFlow). "ไปต่อเมื่อพร้อม" (Self-Paced) never auto-plays anything;
  // the learner drives every part manually via the buttons in the Questions card.
  useEffect(() => {
    if (phase === "practice" && showQuestions && pacingMode === "AUTO" && !autoFlowStartedRef.current) {
      autoFlowStartedRef.current = true;
      if (listenMode === "PURE") runPureAutoFlow();
      else runAutoFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleStartPractice() {
    audioRef.current?.pause();
    setPhase("practice");
  }

  const { correct, total } = questionsSubmitted ? gradeQuestions() : { correct: 0, total: questions?.length ?? 0 };

  // ---- Listening Progress sidebar (donut + Question Navigator) ----
  // Same math/markup as ReadingWorkspace's QuestionPlayerFullscreen sidebar,
  // reused here per the "borrow Reading workspace patterns" ask.
  const isAnswered = (i: number) => !!(answers[i] ?? "").trim();
  const answeredExcludingCurrent = (questions ?? []).filter((_, i) => i !== currentQ && isAnswered(i)).length;
  const unansweredExcludingCurrent = Math.max(0, total - answeredExcludingCurrent - 1);
  const donutPercent = total ? Math.round((answeredExcludingCurrent / total) * 100) : 0;
  const DONUT_R = 52;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  const donutDash = (donutPercent / 100) * DONUT_C;

  return (
    <>
      <audio
        ref={audioRef}
        className="hidden"
        onPlay={() => setPlayState("playing")}
        onPause={() => setPlayState((s) => (s === "playing" ? "paused" : s))}
        onEnded={() => setPlayState("idle")}
        onError={() => setPlayState("idle")}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />

      <Dialog open={phase === "setup"} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Headphones className="h-4 w-4" /> Listening Practice Setup</DialogTitle>
            <DialogDescription>ตั้งค่าก่อนเริ่มฝึกฟัง</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {showTranslation && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">ภาษาที่จะแปล (Translate into)</p>
                <div className="flex flex-wrap gap-1.5">
                  {TRANSLATE_LANGUAGES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setTargetLang(l)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        targetLang === l ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showQuestions && (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">โหมดการฟัง</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SetupOptionCard
                      active={listenMode === "PURE"}
                      onClick={() => setListenMode("PURE")}
                      title="ฟังทั้งหมด"
                      description="ซ่อนบทความ คำถาม และตัวเลือกทั้งหมด - เห็นแค่ปุ่มเล่นเสียงกับปุ่มตอบ"
                    />
                    <SetupOptionCard
                      active={listenMode === "GUIDED"}
                      onClick={() => setListenMode("GUIDED")}
                      title="เห็นคำถาม"
                      description="ฟังบทความอย่างเดียว แต่คำสั่ง คำถาม และตัวเลือกอ่านได้จากหน้าจอ"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">โหมดการฝึก</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SetupOptionCard
                      active={pacingMode === "AUTO"}
                      onClick={() => setPacingMode("AUTO")}
                      title="อัตโนมัติ"
                      description="เล่นบทความ คำสั่ง คำถาม และตัวเลือก ต่อเนื่องอัตโนมัติทีละข้อ"
                    />
                    <SetupOptionCard
                      active={pacingMode === "SELF_PACED"}
                      onClick={() => setPacingMode("SELF_PACED")}
                      title="ไปต่อเมื่อพร้อม"
                      description="กดฟังแต่ละส่วนเอง ฟังซ้ำได้ แล้วกดข้อถัดไปเมื่อพร้อม"
                    />
                  </div>
                </div>
              </>
            )}

            <Button className="w-full gap-2" onClick={() => setPhase("intro")}>
              <Headphones className="h-4 w-4" /> Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {phase === "intro" && (
        <div className="mx-auto max-w-xl space-y-5 py-10">
          <Card>
            <CardContent className="space-y-5 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Headphones className="h-6 w-6" />
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{buildIntroText()}</p>
              <Button size="lg" className="gap-2" onClick={handleStartPractice}>
                <Play className="h-4 w-4" /> Start Practice
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {phase === "practice" && (
        <div className="mx-auto grid max-w-5xl gap-5 pb-24 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" /> {readOnly ? "Back" : "New Exercise"}
              </Button>
              {metaLine && <p className="text-xs text-muted-foreground">{metaLine}</p>}
            </div>

            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold">{title}</h2>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to={`/article/${articleId}/practice/reading`}>
                        <BookOpen className="h-3.5 w-3.5" /> Test Reading
                      </Link>
                    </Button>
                    {!readOnly && (
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link to={`/article/${articleId}/edit`}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                      </Button>
                    )}
                    {readOnly && saved ? (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toggleLike.mutate(articleId)}>
                        <Heart className={cn("h-4 w-4", saved.stats.liked && "fill-red-500 text-red-500")} />
                        {saved.stats.likes}
                      </Button>
                    ) : !readOnly && saved ? (
                      <MiniVisibilityPills
                        visibility={saved.visibility}
                        onUpdate={(v) => updatePassage.mutate({ id: articleId, visibility: v })}
                      />
                    ) : null}
                  </div>
                </div>

                {!showQuestions && (
                  <div className="space-y-2">
                    <AudioPlayerCard
                      active={activeTrack === "ARTICLE"}
                      playState={playState}
                      currentTime={currentTime}
                      duration={duration}
                      volume={volume}
                      speed={speed}
                      onPlayPause={() => handleCardPlayPause("ARTICLE")}
                      onSeek={seekTo}
                      onSkip={skip}
                      onChangeSpeed={changeSpeed}
                      onChangeVolume={setVolume}
                      onToggleMute={toggleMute}
                    />
                    {saved?.audioUrl && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
                        onClick={() => playStoredUrl(saved.audioUrl!, "ARTICLE")}
                        disabled={playState === "loading"}
                        title="ฟังทั้งหมด: บทความ + คำถาม + ตัวเลือก"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> ฟังทั้งหมด
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {showTranslation ? (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="font-semibold">Your Translation ({targetLang})</h2>
                  <textarea
                    className="h-32 w-full rounded-md border p-3 text-sm"
                    placeholder="Listen, then write your translation here..."
                    value={userTranslation}
                    onChange={(e) => setUserTranslation(e.target.value)}
                    disabled={translationChecked}
                  />
                  {!translationChecked ? (
                    <Button className="w-full" onClick={checkTranslation} disabled={!userTranslation.trim()}>Check</Button>
                  ) : (
                    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Original Transcript</p>
                        <p className="whitespace-pre-line">{transcript}</p>
                      </div>
                      {translation && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Reference Translation</p>
                          <p className="whitespace-pre-line">{translation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : showQuestions ? (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Questions</h2>
                    {questionsSubmitted ? (
                      <p className="text-sm font-medium">Score: {correct} / {total}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">ข้อที่ {currentQ + 1} / {questions?.length ?? 0}</p>
                    )}
                  </div>

                  {!questionsSubmitted ? (
                    <>
                      {listenMode === "GUIDED" && (
                        <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{instructionText()}</p>
                      )}

                      {/* Same two-card layout for both pacing modes now - Auto just
                          renders them non-interactive (interactive={false}) so the
                          learner still sees real progress/skip/speed dials, they're
                          just disabled while the timeline drives itself. */}
                      <div className="space-y-2">
                        <AudioPlayerCard
                          label={listenMode === "PURE" ? "Article" : undefined}
                          active={activeTrack === "ARTICLE"}
                          interactive={pacingMode === "SELF_PACED"}
                          playState={playState}
                          currentTime={currentTime}
                          duration={duration}
                          volume={volume}
                          speed={speed}
                          onPlayPause={() => handleCardPlayPause("ARTICLE")}
                          onSeek={seekTo}
                          onSkip={skip}
                          onChangeSpeed={changeSpeed}
                          onChangeVolume={setVolume}
                          onToggleMute={toggleMute}
                        />
                        {/* Guided mode's question/choices are already readable on
                            screen, so only Pure mode needs a second card to hear
                            them - see QuestionStage below. */}
                        {listenMode === "PURE" && (
                          <AudioPlayerCard
                            label="Question / Options"
                            active={activeTrack === "QUESTION_OPTIONS"}
                            interactive={pacingMode === "SELF_PACED"}
                            playState={playState}
                            currentTime={currentTime}
                            duration={duration}
                            volume={volume}
                            speed={speed}
                            onPlayPause={() => handleCardPlayPause("QUESTION_OPTIONS")}
                            onSeek={seekTo}
                            onSkip={skip}
                            onChangeSpeed={changeSpeed}
                            onChangeVolume={setVolume}
                            onToggleMute={toggleMute}
                          />
                        )}
                        {/* Auto pacing's spoken instruction has no card of its own -
                            surface it as a small transient status line instead.
                            (Pure mode's own flow below never sets this - the
                            instruction is folded into each Question/Options
                            clip instead, so this only ever fires for Guided.) */}
                        {pacingMode === "AUTO" && !autoFlowDone && nowPlayingPart === "INSTRUCTION" && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังเล่นคำสั่ง...
                          </p>
                        )}
                        {/* Pure + Auto's own countdown UI: "about to begin" once
                            after the article, then "answer the question" /
                            "time is running out" per question - see runPureAutoFlow. */}
                        {listenMode === "PURE" && pacingMode === "AUTO" && countdownText && (
                          <div className="rounded-md border bg-accent/30 p-3 text-center">
                            <p className={cn(
                              "text-sm font-semibold",
                              countdownPhase === "ANSWER" && countdownText.startsWith("Time is running out") && "text-red-600"
                            )}>
                              {countdownText}
                            </p>
                            {countdownPhase === "ANSWER" && (
                              <Button variant="outline" size="sm" className="mt-2" onClick={skipCountdown}>
                                ข้อถัดไป
                              </Button>
                            )}
                          </div>
                        )}
                        {pacingMode === "AUTO" && autoFlowDone && (
                          <p className="text-xs text-muted-foreground">ฟังครบทุกข้อแล้ว - ตรวจสอบคำตอบแล้วกด Submit</p>
                        )}
                      </div>

                      {highlightMode && (
                        <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 p-2">
                          <span className="mr-1 text-xs text-muted-foreground">สีปากกา:</span>
                          {HIGHLIGHT_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setPenColor(color)}
                              className={cn(
                                "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                                penColor === color ? "border-foreground" : "border-transparent"
                              )}
                              style={{ backgroundColor: color }}
                              aria-label="Choose highlight color"
                            />
                          ))}
                        </div>
                      )}

                      {questions?.[currentQ] && (
                        <QuestionStage
                          question={questions[currentQ]}
                          value={answers[currentQ] ?? ""}
                          onChange={(v) => updateAnswer(currentQ, v)}
                          listenMode={listenMode}
                          highlights={currentQuestionHighlights}
                          highlightMode={highlightMode}
                          eraseMode={eraseMode}
                          penColor={penColor}
                          onCreateHighlight={handleCreateQuestionHighlight}
                          onEraseRange={handleEraseQuestionRange}
                          onRemoveHighlight={handleRemoveHighlight}
                        />
                      )}
                    </>
                  ) : !questionsChecked ? (
                    <Button className="w-full" variant="outline" onClick={() => setQuestionsChecked(true)}>
                      Check (Original Transcript / Answers)
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {(questions ?? []).map((q, i) => {
                        const given = (answers[i] ?? "").trim().toLowerCase();
                        const isRowCorrect = !!given && given === q.answer.trim().toLowerCase();
                        return (
                          <div key={i} className="space-y-1.5 rounded-lg border p-3 text-sm">
                            <p className="font-medium">{i + 1}. {q.prompt}</p>
                            <div className={cn("flex items-center gap-1.5 text-xs font-medium", isRowCorrect ? "text-emerald-600" : "text-red-600")}>
                              {isRowCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              คำตอบของคุณ: {answers[i] || "-"}{!isRowCorrect && ` (เฉลย: ${q.answer})`}
                            </div>
                          </div>
                        );
                      })}
                      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Original Transcript</p>
                        <p className="whitespace-pre-line">{transcript}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">
                  This article has no translation-check or questions attached - just press play and listen.
                </CardContent>
              </Card>
            )}

            {readOnly && saved && (
              <Card>
                <CardContent className="flex items-center justify-center gap-1 p-4">
                  <span className="mr-2 text-sm text-muted-foreground">Rate this exercise:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => submitRating.mutate({ articleId, rating: n })}>
                      <Star
                        className={cn(
                          "h-5 w-5",
                          saved.stats.myRating && n <= saved.stats.myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                        )}
                      />
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-3">
            {/* ---- Listening Progress sidebar: mirrors ReadingWorkspace's
                Reading Progress / Your Progress donut / Question Navigator
                pattern - only meaningful while actively answering (hidden
                once submitted, when the main panel switches to the review
                screen instead). ---- */}
            {showQuestions && !questionsSubmitted && (
              <>
                <Card className="lg:sticky lg:top-4">
                  <CardContent className="space-y-3 p-4">
                    <h2 className="font-semibold">Listening Progress</h2>
                    <StatRow icon={<Clock className="h-4 w-4" />} label="Reading Time" value={formatElapsed(elapsedSec)} />
                    <StatRow icon={<ListChecks className="h-4 w-4" />} label="Questions" value={String(total)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="space-y-4 p-4">
                    <h3 className="text-sm font-semibold">Your Progress</h3>
                    <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
                      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
                        <circle cx="64" cy="64" r={DONUT_R} fill="none" strokeWidth="10" className="stroke-muted" />
                        <circle
                          cx="64" cy="64" r={DONUT_R} fill="none" strokeWidth="10" strokeLinecap="round"
                          className="stroke-primary transition-all"
                          strokeDasharray={`${donutDash} ${DONUT_C}`}
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
                    <div className="grid grid-cols-5 gap-2">
                      {(questions ?? []).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => jumpToQuestion(i)}
                          disabled={pacingMode === "AUTO"}
                          title={pacingMode === "AUTO" ? "ปิดใช้งานระหว่างโหมดอัตโนมัติ" : undefined}
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors disabled:cursor-not-allowed",
                            i === currentQ
                              ? "border-primary bg-primary text-primary-foreground"
                              : isAnswered(i)
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-muted-foreground/30 text-muted-foreground enabled:hover:bg-accent"
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {pacingMode === "SELF_PACED" ? (
                  <Button className="w-full" onClick={goToNextQuestion}>
                    {currentQ < total - 1 ? "Next Question" : "Submit"}
                  </Button>
                ) : autoFlowDone ? (
                  <Button className="w-full" onClick={submitAnswers}>Submit</Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังฟังอัตโนมัติ...
                  </Button>
                )}
              </>
            )}

          </div>
        </div>
      )}

      {/* ---- Persistent bottom toolbar - ported from ReadingWorkspace.
          Highlight/Eraser act on the Guided-mode question/options text (see
          QuestionStage) - disabled in Pure mode since there's no on-screen
          question text there to paint over. Note is a real floating,
          draggable, resizable, DB-backed window (see below). ---- */}
      {phase === "practice" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-sm items-center justify-around py-2">
            <BottomToolButton
              icon={<Highlighter className="h-5 w-5" />}
              label="Highlight"
              active={highlightMode}
              onClick={toggleHighlightMode}
              disabled={listenMode !== "GUIDED" || !showQuestions || questionsSubmitted}
              badge={listenMode !== "GUIDED" ? "โหมด Guided เท่านั้น" : undefined}
            />
            <BottomToolButton
              icon={<Eraser className="h-5 w-5" />}
              label="Eraser"
              active={eraseMode}
              onClick={toggleEraseMode}
              disabled={listenMode !== "GUIDED" || !showQuestions || questionsSubmitted}
              badge={listenMode !== "GUIDED" ? "โหมด Guided เท่านั้น" : undefined}
            />
            <BottomToolButton
              icon={<StickyNote className="h-5 w-5" />}
              label="Note"
              active={!!noteBox}
              onClick={() => (noteBox ? closeNoteBox() : openNoteBox())}
            />
            <BottomToolButton icon={<MoreHorizontal className="h-5 w-5" />} label="More" disabled badge="Coming soon" />
          </div>
        </div>
      )}

      {/* ---- Floating Note window - ported (text-only) from ReadingWorkspace ---- */}
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
            <textarea
              autoFocus
              className="h-full w-full flex-1 resize-none rounded-md border bg-white p-2 text-sm outline-none"
              placeholder="Jot down keywords, numbers, places, dates..."
              value={noteBox.draft}
              onChange={(e) => {
                setNoteBox({ ...noteBox, draft: e.target.value });
                scheduleNoteAutosave();
              }}
            />
            <p className="shrink-0 text-center text-[11px] text-muted-foreground">Saved automatically</p>
          </div>

          <div
            onPointerDown={handleNoteResizePointerDown}
            onPointerMove={handleNoteResizePointerMove}
            onPointerUp={handleNoteResizePointerUp}
            title="Resize"
            className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor">
              <circle cx="8" cy="8" r="1" />
              <circle cx="8" cy="4.5" r="1" />
              <circle cx="4.5" cy="8" r="1" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
}

function BottomToolButton({
  icon, label, onClick, disabled, badge, active,
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
            : "text-muted-foreground hover:text-primary"
      )}
    >
      {icon}
      <span>{label}</span>
      {badge && <span className="text-[10px] font-normal text-muted-foreground/70">{badge}</span>}
    </button>
  );
}

function SetupOptionCard({
  active, onClick, title, description,
}: { active: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-accent"
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <span
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
            active ? "border-primary bg-primary" : "border-muted-foreground/40"
          )}
        >
          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function MiniVisibilityPills({ visibility, onUpdate }: { visibility?: string; onUpdate: (v: string) => void }) {
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
          type="button"
          onClick={() => onUpdate(o.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            visibility === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Full-featured audio player card: play/pause, a seekable progress bar with
// elapsed/total time, ±10s skip, a compact speed dropdown, and a volume
// slider with mute toggle - the "audio modes" (เร่งความเร็ว / ไป-กลับ 10 วิ /
// เพิ่มลดเสียง) requested for the Listening workspace, styled to match the
// pill/dropdown/icon-button conventions already used across the Reading
// workspace. Multiple cards can exist on screen (e.g. "Article" and
// "Question / Options" in Pure Audio Mode) but they all drive the same
// single shared <audio> element - `active` tells a card whether the live
// time/duration/play-state currently belongs to it or to some other clip.
function AudioPlayerCard({
  label, active, playState, currentTime, duration, volume, speed, interactive = true,
  onPlayPause, onSeek, onSkip, onChangeSpeed, onChangeVolume, onToggleMute,
}: {
  label?: string;
  active: boolean;
  playState: PlayState;
  currentTime: number;
  duration: number;
  volume: number;
  speed: TTSSpeed;
  /** false during Auto pacing - the player reflects live progress but play/pause, seek, skip, and speed are all disabled (view-only); volume stays interactive either way. */
  interactive?: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (deltaSeconds: number) => void;
  onChangeSpeed: (speed: TTSSpeed) => void;
  onChangeVolume: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const isLoadingThis = active && playState === "loading";
  const isPlayingThis = active && playState === "playing";
  const shownTime = active ? currentTime : 0;
  const shownDuration = active ? duration : 0;

  return (
    <div className="rounded-lg border p-3">
      {label && <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-transform active:scale-95 disabled:opacity-60"
          onClick={onPlayPause}
          disabled={isLoadingThis || !interactive}
        >
          {isLoadingThis ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlayingThis ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </button>

        <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(shownTime)}</span>
        <input
          type="range"
          className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          min={0}
          max={shownDuration || 0}
          step={0.1}
          value={Math.min(shownTime, shownDuration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!active || !shownDuration || !interactive}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatTime(shownDuration)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={() => onSkip(-10)}
          disabled={!active || !interactive}
          title="ถอยหลัง 10 วินาที"
        >
          <RotateCcw className="h-4 w-4" /> 10
        </button>

        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
            onClick={() => setSpeedOpen((o) => !o)}
            disabled={!interactive}
          >
            {speed}x <ChevronDown className="h-3 w-3" />
          </button>
          {speedOpen && (
            <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border bg-popover p-1 shadow-md">
              {ALLOWED_SPEEDS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={cn(
                    "block w-full whitespace-nowrap rounded px-3 py-1 text-left text-xs hover:bg-accent",
                    speed === r && "font-semibold text-primary"
                  )}
                  onClick={() => {
                    onChangeSpeed(r);
                    setSpeedOpen(false);
                  }}
                >
                  {r}x
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={() => onSkip(10)}
          disabled={!active || !interactive}
          title="เดินหน้า 10 วินาที"
        >
          <RotateCw className="h-4 w-4" /> 10
        </button>

        <div className="flex items-center gap-1.5">
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onToggleMute} title="เพิ่ม/ลดเสียง">
            {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            className="h-1.5 w-16 cursor-pointer accent-primary"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onChangeVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

// One question at a time - "ฟังทั้งหมด" (Pure) hides the prompt/option text
// entirely (only bare answer letters or an input box are shown); "เห็นคำถาม"
// (Guided) shows the real prompt/option text. Either way, actually playing
// the audio for this question is driven by the parent (auto-timed, or the
// Self-Paced part buttons) - this component is just the answer surface.
//
// Guided mode's prompt/option text also doubles as the Highlight/Eraser
// surface (bottom toolbar) - see guidedCompositeLines/guidedCompositeText at
// the top of this file for the exact text the stored offsets are computed
// against. While painting or erasing, the answer-choice buttons are swapped
// for plain (non-interactive) text so a text-selection drag can never also
// register as an accidental answer click.
function QuestionStage({
  question, value, onChange, listenMode,
  highlights, highlightMode, eraseMode, penColor,
  onCreateHighlight, onEraseRange, onRemoveHighlight,
}: {
  question: ReadingQuestion;
  value: string;
  onChange: (v: string) => void;
  listenMode: "GUIDED" | "PURE";
  highlights: HighlightItem[];
  highlightMode: boolean;
  eraseMode: boolean;
  penColor: string;
  onCreateHighlight: (text: string, start: number, end: number) => void;
  onEraseRange: (start: number, end: number) => void;
  onRemoveHighlight: (id: string) => void;
}) {
  const isChoice = isChoiceQuestion(question);
  const letters = ["A", "B", "C", "D", "E", "F"];
  const annotating = listenMode === "GUIDED" && (highlightMode || eraseMode);
  const containerRef = useRef<HTMLDivElement>(null);

  const compositeLines = listenMode === "GUIDED" ? guidedCompositeLines(question) : [question.prompt];
  const lineRanges: { start: number; end: number }[] = [];
  {
    let pos = 0;
    for (const line of compositeLines) {
      lineRanges.push({ start: pos, end: pos + line.length });
      pos += line.length + 1; // +1 for the "\n" joiner
    }
  }

  function handleMouseUp() {
    if (!highlightMode && !eraseMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const text = sel.toString().trim();
    if (!text) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const start = getOffsetWithinContainer(containerRef.current, range.startContainer, range.startOffset);
    const end = getOffsetWithinContainer(containerRef.current, range.endContainer, range.endOffset);
    const full = compositeLines.join("\n");
    const snapped = snapRangeToWords(full, Math.min(start, end), Math.max(start, end));
    if (snapped.start >= snapped.end) return;

    if (eraseMode) {
      onEraseRange(snapped.start, snapped.end);
    } else {
      onCreateHighlight(full.slice(snapped.start, snapped.end), snapped.start, snapped.end);
    }
    window.getSelection()?.removeAllRanges();
  }

  function renderLine(line: string, absStart: number, absEnd: number, key: string) {
    const points = new Set([absStart, absEnd]);
    highlights.forEach((h) => {
      if (h.startOffset < absEnd && h.endOffset > absStart) {
        points.add(Math.max(h.startOffset, absStart));
        points.add(Math.min(h.endOffset, absEnd));
      }
    });
    const bounds = Array.from(points).sort((a, b) => a - b);
    const segments: { text: string; color: string | null; id: string | null }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const segStart = bounds[i];
      const segEnd = bounds[i + 1];
      if (segStart >= segEnd) continue;
      const hit = highlights.find((h) => h.startOffset <= segStart && h.endOffset >= segEnd);
      segments.push({ text: line.slice(segStart - absStart, segEnd - absStart), color: hit?.color ?? null, id: hit?.id ?? null });
    }
    return (
      <span key={key}>
        {segments.map((seg, i) =>
          seg.color ? (
            <mark
              key={i}
              style={{ backgroundColor: seg.color }}
              className={cn(
                "rounded px-0.5 text-inherit",
                eraseMode && "cursor-pointer opacity-100 ring-2 ring-transparent transition-all hover:opacity-50 hover:ring-destructive"
              )}
              title={eraseMode ? "Click to remove this highlight" : undefined}
              onClick={(e) => {
                if (!eraseMode || !seg.id) return;
                e.preventDefault();
                e.stopPropagation();
                onRemoveHighlight(seg.id);
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </span>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {listenMode === "GUIDED" && (
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          className="space-y-1.5"
          style={{ cursor: highlightMode ? highlightCursor(penColor) : eraseMode ? eraserCursor() : undefined }}
        >
          <p className="text-sm font-medium">{renderLine(compositeLines[0], lineRanges[0].start, lineRanges[0].end, "prompt")}</p>
          {annotating && isChoice && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {question.options.map((opt, i) => (
                <div key={opt} className="rounded-md border px-3 py-2 text-left text-sm font-medium text-muted-foreground">
                  {renderLine(opt, lineRanges[i + 1].start, lineRanges[i + 1].end, `opt-${i}`)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!annotating &&
        (isChoice ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {question.options.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                  value === opt ? "border-primary bg-accent" : "hover:bg-accent"
                )}
              >
                {listenMode === "PURE" ? (letters[i] ?? i + 1) : renderLine(opt, lineRanges[i + 1]?.start ?? 0, lineRanges[i + 1]?.end ?? opt.length, `optbtn-${i}`)}
              </button>
            ))}
          </div>
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type what you heard..."
          />
        ))}
    </div>
  );
}
