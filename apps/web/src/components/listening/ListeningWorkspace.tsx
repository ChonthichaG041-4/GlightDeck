// Listening practice UI for a *stored* Article (shared with Reading - a
// listening exercise is just a passage played back via TTS instead of read
// on screen). Deliberately much simpler than ReadingWorkspace: no highlights/
// notes/dictionary popup, just play/pause/replay + translation-or-questions
// practice + a scratch note panel, matching ListeningPage's original
// generator-practice UI.
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
  ArrowLeft, Play, Pause, RotateCcw, Gauge, Heart, Pencil, Headphones, Volume2,
  CheckCircle2, XCircle, Share2, Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  usePassage, useUpdatePassage, useToggleLike, useSubmitListeningAttempt, useSubmitRating,
  type ReadingQuestion,
} from "@/api/hooks";
import { speakPassage, pauseSpeech, resumeSpeech, cancelSpeech, type Accent, type VoiceGender } from "@/lib/tts";
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
  /** Voice/accent/speed picked in the Generate wizard, if this came straight from generation. */
  initialAccent?: Accent;
  initialVoice?: VoiceGender;
  initialSpeed?: number;
}

const SPEEDS = [0.75, 1, 1.25];

const TRANSLATE_LANGUAGES = [
  "Thai", "English", "Japanese", "Korean", "Chinese", "Vietnamese", "French", "German", "Spanish", "Indonesian",
];

type Phase = "setup" | "intro" | "practice";

export default function ListeningWorkspace({
  articleId, title, transcript, translation, questions, testMode, metaLine, onBack, readOnly,
  initialAccent, initialVoice, initialSpeed,
}: Props) {
  const { data: saved } = usePassage(articleId);
  const updatePassage = useUpdatePassage();
  const toggleLike = useToggleLike();
  const submitAttempt = useSubmitListeningAttempt();
  const submitRating = useSubmitRating();

  const showQuestions = (testMode === "QUESTIONS" || testMode === "MIXED") && !!questions?.length;
  const showTranslation = testMode === "TRANSLATION";

  const [accent] = useState<Accent>(initialAccent ?? "AMERICAN");
  const [voice] = useState<VoiceGender>(initialVoice ?? "FEMALE");
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed ?? 1);
  const [playState, setPlayState] = useState<"idle" | "playing" | "paused">("idle");

  const [userTranslation, setUserTranslation] = useState("");
  const [translationChecked, setTranslationChecked] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false);
  const [questionsChecked, setQuestionsChecked] = useState(false);
  const [notes, setNotes] = useState("");

  // ---- Pre-practice setup/intro ----
  const [phase, setPhase] = useState<Phase>(showTranslation || showQuestions ? "setup" : "practice");
  const [targetLang, setTargetLang] = useState("Thai");
  const [listenAllMode, setListenAllMode] = useState(false); // false = "เห็นคำถาม" (see questions), true = "ฟังทั้งหมด" (listen to everything)
  const [autoStart, setAutoStart] = useState(true); // true = "อัตโนมัติ", false = "ไปต่อเมื่อพร้อม"
  const introSpokenRef = useRef(false);
  const autoPlayedRef = useRef(false);

  useEffect(() => () => cancelSpeech(), []);

  function playFromStart() {
    const utt = speakPassage(transcript, { accent, gender: voice, rate: playbackSpeed });
    if (!utt) return;
    setPlayState("playing");
    utt.onend = () => setPlayState("idle");
    utt.onerror = () => setPlayState("idle");
  }

  function togglePlayPause() {
    if (playState === "playing") {
      pauseSpeech();
      setPlayState("paused");
      return;
    }
    if (playState === "paused") {
      resumeSpeech();
      setPlayState("playing");
      return;
    }
    playFromStart();
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
      const closing = autoStart ? "When you are ready, let's begin." : "Click Start when you're ready.";
      return `You will listen to an audio passage.\nAfter listening, answer the multiple-choice questions based on what you heard.\n\n${closing}`;
    }
    return "";
  }

  // Speak the intro exactly once when it appears (ref guard survives
  // StrictMode's dev-only double-invoke of effects).
  useEffect(() => {
    if (phase !== "intro" || introSpokenRef.current) return;
    introSpokenRef.current = true;
    speakPassage(buildIntroText(), { accent, gender: voice, rate: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // If "อัตโนมัติ" (automatic) was chosen, start playing as soon as practice
  // begins - only applies to the Questions flow (that's the only mode the
  // setup dialog offers this choice for; Translation always waits for the
  // learner to press play themselves).
  useEffect(() => {
    if (phase === "practice" && showQuestions && autoStart && !autoPlayedRef.current) {
      autoPlayedRef.current = true;
      playFromStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleStartPractice() {
    cancelSpeech();
    setPhase("practice");
  }

  const { correct, total } = questionsSubmitted ? gradeQuestions() : { correct: 0, total: questions?.length ?? 0 };

  return (
    <>
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
                      active={listenAllMode}
                      onClick={() => setListenAllMode(true)}
                      title="ฟังทั้งหมด"
                      description="บทความ คำถาม และตัวเลือก ต้องฟังเองทั้งหมด"
                    />
                    <SetupOptionCard
                      active={!listenAllMode}
                      onClick={() => setListenAllMode(false)}
                      title="เห็นคำถาม"
                      description="ฟังบทความ แต่มีคำถามให้อ่านพร้อมฟัง"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">การเริ่มฝึก</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SetupOptionCard
                      active={autoStart}
                      onClick={() => setAutoStart(true)}
                      title="อัตโนมัติ"
                      description="เริ่มฟังทันทีหลังกด Start Practice"
                    />
                    <SetupOptionCard
                      active={!autoStart}
                      onClick={() => setAutoStart(false)}
                      title="ไปต่อเมื่อพร้อม"
                      description="กด Play เองเมื่อพร้อม"
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
        <div className="mx-auto grid max-w-5xl gap-5 pb-10 lg:grid-cols-[1fr_280px]">
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
                    {!readOnly && (
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link to={`/reading/${articleId}/edit`}>
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

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
                    onClick={togglePlayPause}
                  >
                    {playState === "playing" ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </button>
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-accent"
                    onClick={playFromStart}
                    title="Replay"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-medium">🎧 Audio</p>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" /> Playback Speed
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SPEEDS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPlaybackSpeed(r)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          playbackSpeed === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                </div>
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
                    {questionsSubmitted && <p className="text-sm font-medium">Score: {correct} / {total}</p>}
                  </div>

                  {listenAllMode && (
                    <p className="flex items-center gap-1.5 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      <Volume2 className="h-3.5 w-3.5 shrink-0" /> โหมดฟังทั้งหมด - กดปุ่มลำโพงเพื่อฟังคำถามและตัวเลือก
                    </p>
                  )}

                  {(questions ?? []).map((q, i) => (
                    <ListeningQuestionBlock
                      key={i}
                      index={i}
                      question={q}
                      value={answers[i] ?? ""}
                      onChange={(v) => updateAnswer(i, v)}
                      disabled={questionsSubmitted}
                      showResult={questionsChecked}
                      listenAllMode={listenAllMode}
                      accent={accent}
                      voice={voice}
                    />
                  ))}

                  {!questionsSubmitted ? (
                    <Button className="w-full" onClick={submitAnswers}>Submit</Button>
                  ) : !questionsChecked ? (
                    <Button className="w-full" variant="outline" onClick={() => setQuestionsChecked(true)}>
                      Check (Original Transcript / Answers)
                    </Button>
                  ) : (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Original Transcript</p>
                      <p className="whitespace-pre-line">{transcript}</p>
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

          <div className="space-y-2">
            <Card className="lg:sticky lg:top-4">
              <CardContent className="space-y-2 p-4">
                <h2 className="font-semibold">Note Panel</h2>
                <p className="text-xs text-muted-foreground">Jot down keywords, numbers, places, dates...</p>
                <textarea
                  className="h-64 w-full rounded-md border p-3 text-sm"
                  placeholder={"keyword\nnumber\nplace\ndate"}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
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

function ListeningQuestionBlock({
  index, question, value, onChange, disabled, showResult, listenAllMode, accent, voice,
}: {
  index: number;
  question: ReadingQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  showResult: boolean;
  listenAllMode: boolean;
  accent: Accent;
  voice: VoiceGender;
}) {
  const isCorrect = value.trim().toLowerCase() === question.answer.trim().toLowerCase();
  const isChoice = ["MULTIPLE_CHOICE", "TRUE_FALSE", "YES_NO_NOTGIVEN"].includes(question.type) && question.options?.length > 0;
  const letters = ["A", "B", "C", "D", "E", "F"];

  function playQuestion() {
    const text = isChoice
      ? `${question.prompt}. ${question.options.map((opt, i) => `Option ${letters[i] ?? i + 1}: ${opt}`).join(". ")}`
      : question.prompt;
    speakPassage(text, { accent, gender: voice, rate: 1 });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{index + 1}. {listenAllMode ? "Listen to the question" : question.prompt}</p>
        {listenAllMode && (
          <button
            type="button"
            onClick={playQuestion}
            title="Play question"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border hover:bg-accent"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isChoice ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {question.options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                value === opt ? "border-primary bg-accent" : "hover:bg-accent",
                disabled && "opacity-70"
              )}
            >
              {listenAllMode ? `Option ${letters[i] ?? i + 1}` : opt}
            </button>
          ))}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={listenAllMode ? "Type what you heard..." : "Your answer..."}
        />
      )}

      {showResult && (
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", isCorrect ? "text-emerald-600" : "text-red-600")}>
          {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          Correct answer: {question.answer}
        </div>
      )}
    </div>
  );
}
