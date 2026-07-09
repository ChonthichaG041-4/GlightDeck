import { useState, type ReactNode, type ComponentType } from "react";
import {
  Wand2, Headphones, BookOpen, Gem, BarChart3, FileText, Clock, Mic, Globe, Gauge,
  Sparkles, Sprout, Book, MessageCircle, TrendingUp, Star, Crown, Shuffle,
  Check, Minus, Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useGenerateListeningExercise, useCreatePassage,
  type ListeningExercise, type ReadingQuestion,
} from "@/api/hooks";
import ListeningWorkspace from "@/components/listening/ListeningWorkspace";
import { speedToRate, type Accent, type VoiceGender } from "@/lib/tts";
import { cn } from "@/lib/utils";

const DIFFICULTY_CARDS: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string }[] = [
  { value: "AUTO", icon: Sparkles, title: "Auto", description: "AI selects the appropriate level" },
  { value: "A1", icon: Sprout, title: "Beginner (A1)", description: "Basic vocabulary and simple sentences" },
  { value: "A2", icon: Book, title: "Elementary (A2)", description: "Everyday topics and simple conversations" },
  { value: "B1", icon: MessageCircle, title: "Intermediate (B1)", description: "Familiar topics and connected ideas" },
  { value: "B2", icon: TrendingUp, title: "Upper Intermediate (B2)", description: "Complex ideas and detailed information" },
  { value: "C1", icon: Star, title: "Advanced (C1)", description: "Abstract topics and advanced language" },
  { value: "C2", icon: Crown, title: "Proficiency (C2)", description: "Sophisticated content and nuanced meaning" },
  { value: "MIXED", icon: Shuffle, title: "Mixed", description: "Mixed levels for varied practice" },
];
const DIFFICULTY_LABELS: Record<string, string> = Object.fromEntries(DIFFICULTY_CARDS.map((d) => [d.value, d.title]));
const LENGTHS = [
  { value: "SHORT", label: "Short" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LONG", label: "Long" },
];
const EXAM_MODES = [
  { value: "IELTS", label: "IELTS" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "TOEIC", label: "TOEIC" },
  { value: "CU_TEP", label: "CU-TEP" },
  { value: "TU_GET", label: "TU-GET" },
  { value: "GENERAL_ENGLISH", label: "General English" },
];
const VOICES = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
];
const ACCENTS = [
  { value: "AMERICAN", label: "American" },
  { value: "BRITISH", label: "British" },
  { value: "AUSTRALIAN", label: "Australian" },
];
const SPEEDS = [
  { value: "SLOW", label: "Slow" },
  { value: "NORMAL", label: "Normal" },
  { value: "FAST", label: "Fast" },
];

const SKILLS = [
  { value: "GIST", label: "Listening for Gist" },
  { value: "DETAILS", label: "Listening for Details" },
  { value: "INFERENCE", label: "Inference" },
  { value: "ATTITUDE_EMOTION", label: "Attitude & Emotion" },
  { value: "SPEAKERS_PURPOSE", label: "Speaker's Purpose" },
  { value: "SEQUENCING", label: "Sequencing" },
  { value: "VOCAB_IN_CONTEXT", label: "Vocabulary from Context" },
  { value: "INFORMATION_CONNECTIONS", label: "Information Connections" },
  { value: "SUMMARIZING", label: "Summarizing" },
  { value: "FOLLOWING_INSTRUCTIONS", label: "Following Instructions" },
  { value: "MIXED", label: "Mixed Skills" },
];

const TEST_MODES = [
  { value: "TRANSLATION", label: "Listening + Translation" },
  { value: "QUESTIONS", label: "Listening + Questions" },
];
const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "FILL_BLANK", label: "Fill in the Blank" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "MIXED", label: "Mixed" },
];
const QUESTION_COUNTS = [5, 10, 15];

// Listening exercises are stored as Article rows (category: "Listening") - the
// same shared system Reading uses. My Articles / Community used to be tabs
// here too; they now live in the Articles hub (/articles), so this page is
// just the Generate flow. Saved exercises show up in Articles -> My Articles
// automatically (createPassage below), and "Start Listening"/"Test Listening"
// from there is how you come back to one.
export default function ListeningPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">🎧 Listening Practice</h1>
        <p className="text-sm text-muted-foreground">
          Build a custom AI listening exercise. Saved exercises show up in Articles - My Articles.
        </p>
      </div>

      <ListeningGenerator />
    </div>
  );
}

// ============================================================================
// Generate with AI - Setup wizard, then persist + hand off to ListeningWorkspace
// ============================================================================

function ListeningGenerator() {
  // ---- Setup state ----
  const [topic, setTopic] = useState("");
  const [examMode, setExamMode] = useState("GENERAL_ENGLISH");
  const [cefrLevel, setCefrLevel] = useState("AUTO");
  const [paragraphMode, setParagraphMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [paragraphCount, setParagraphCount] = useState(5);
  const [length, setLength] = useState("MEDIUM");
  const [voice, setVoice] = useState<VoiceGender>("FEMALE");
  const [accent, setAccent] = useState<Accent>("AMERICAN");
  const [speakingSpeed, setSpeakingSpeed] = useState<"SLOW" | "NORMAL" | "FAST">("NORMAL");
  const [skills, setSkills] = useState<string[]>(["MIXED"]);
  const [testMode, setTestMode] = useState<"TRANSLATION" | "QUESTIONS">("QUESTIONS");
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MIXED"]);
  const [numQuestions, setNumQuestions] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const generate = useGenerateListeningExercise();
  const createPassage = useCreatePassage();

  // ---- Practice state ----
  const [exercise, setExercise] = useState<ListeningExercise | null>(null);
  const [exerciseTitle, setExerciseTitle] = useState<string>("");
  const [articleId, setArticleId] = useState<string | null>(null);

  function toggleSkill(v: string) {
    setSkills((prev) => {
      if (v === "MIXED") return prev.includes("MIXED") ? [] : ["MIXED"];
      const withoutMixed = prev.filter((s) => s !== "MIXED");
      const next = withoutMixed.includes(v) ? withoutMixed.filter((s) => s !== v) : [...withoutMixed, v];
      return next.length ? next : ["MIXED"];
    });
  }

  function toggleQuestionType(v: string) {
    setQuestionTypes((prev) => {
      if (v === "MIXED") return prev.includes("MIXED") ? [] : ["MIXED"];
      const withoutMixed = prev.filter((s) => s !== "MIXED");
      const next = withoutMixed.includes(v) ? withoutMixed.filter((s) => s !== v) : [...withoutMixed, v];
      return next.length ? next : ["MIXED"];
    });
  }

  function runGenerate() {
    if (!topic.trim()) {
      setError("กรอกหัวข้อที่ต้องการฝึกฟังก่อน");
      return;
    }
    setError(null);
    generate.mutate(
      {
        topic: topic.trim(),
        cefrLevel,
        paragraphs: paragraphMode === "AUTO" ? "AUTO" : paragraphCount,
        length,
        assessmentSkills: skills,
        testMode,
        questionTypes,
        numQuestions,
        targetLang: "th",
        examMode,
      },
      {
        onSuccess: (data) => {
          if (!data.exercise) {
            setError(data.note ?? "สร้างบทฟังไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          const title = deriveTitle(topic, data.exercise.transcript);
          setExercise(data.exercise);
          setExerciseTitle(title);
          setArticleId(null);
          // Persist the generated exercise as an Article (category: "Listening") so
          // it shows up under Articles -> My Articles, gets Edit/Test/Rate support,
          // and can be reopened later - same shared system Reading uses.
          createPassage.mutate(
            {
              title,
              content: data.exercise!.transcript,
              translation: data.exercise!.translation,
              category: "Listening",
              contentSource: "AI_GENERATE",
              cefrLevel,
              testMode,
              questions: (data.exercise!.questions ?? []) as unknown as ReadingQuestion[],
            },
            {
              onSuccess: (res) => setArticleId(res.id),
              onError: () => setError("สร้างสำเร็จ แต่บันทึกบทฟังไม่สำเร็จ ลองใหม่อีกครั้ง"),
            }
          );
        },
        onError: () => setError("สร้างบทฟังไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  function backToSetup() {
    setExercise(null);
    setExerciseTitle("");
    setArticleId(null);
  }

  // ============ Render: Setup wizard ============
  if (!exercise) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Exercise Setup</h2>
                <p className="text-xs text-muted-foreground">Configure your listening practice</p>
              </div>
            </div>

            <div>
              <FieldLabel icon={<BookOpen className="h-4 w-4" />} text="Topic" />
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder='e.g. "Weather", "Ordering Food", "Job Interview", "Traveling in Japan"'
              />
              <p className="mt-1 text-xs text-muted-foreground">Enter a topic or theme for your listening exercise</p>
            </div>

            <div>
              <FieldLabel icon={<Gem className="h-4 w-4" />} text="Exam Mode" />
              <div className="flex flex-wrap gap-1.5">
                {EXAM_MODES.map((m) => (
                  <PillButton key={m.value} active={examMode === m.value} onClick={() => setExamMode(m.value)} showCheck>
                    {m.label}
                  </PillButton>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel icon={<BarChart3 className="h-4 w-4" />} text="Difficulty" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {DIFFICULTY_CARDS.map((d) => (
                  <OptionCard
                    key={d.value}
                    active={cefrLevel === d.value}
                    onClick={() => setCefrLevel(d.value)}
                    icon={<d.icon className="h-5 w-5" />}
                    title={d.title}
                    description={d.description}
                  />
                ))}
              </div>
            </div>

            <div>
              <FieldLabel icon={<FileText className="h-4 w-4" />} text="Paragraphs" />
              <div className="space-y-3 rounded-xl border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <OptionCard
                    active={paragraphMode === "AUTO"}
                    onClick={() => setParagraphMode("AUTO")}
                    icon={<Sparkles className="h-5 w-5" />}
                    title="Auto"
                    description="Let AI decide"
                  />
                  <OptionCard
                    active={paragraphMode === "MANUAL"}
                    onClick={() => setParagraphMode("MANUAL")}
                    icon={<FileText className="h-5 w-5" />}
                    title="Manual"
                    description="Set custom number"
                  />
                </div>
                <div className={cn("rounded-lg bg-muted/40 p-3", paragraphMode === "AUTO" && "pointer-events-none opacity-50")}>
                  <p className="mb-2 text-sm font-medium">Number of paragraphs</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-accent"
                      onClick={() => setParagraphCount((p) => Math.max(1, p - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center font-medium">{paragraphCount}</span>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-accent"
                      onClick={() => setParagraphCount((p) => p + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-muted-foreground">paragraphs</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Range: 1 to 20+ paragraphs</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <PillGroup icon={<Clock className="h-4 w-4" />} label="Length" options={LENGTHS} value={length} onChange={setLength} />
              <PillGroup icon={<Mic className="h-4 w-4" />} label="Voice" options={VOICES} value={voice} onChange={(v) => setVoice(v as VoiceGender)} />
              <PillGroup icon={<Globe className="h-4 w-4" />} label="Accent" options={ACCENTS} value={accent} onChange={(v) => setAccent(v as Accent)} />
              <PillGroup
                icon={<Gauge className="h-4 w-4" />}
                label="Speaking Speed"
                options={SPEEDS}
                value={speakingSpeed}
                onChange={(v) => setSpeakingSpeed(v as "SLOW" | "NORMAL" | "FAST")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="font-semibold">Assessment Goal</h2>
            <Label className="block text-xs text-muted-foreground">Listening Skill</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SKILLS.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={skills.includes(s.value)} onCheckedChange={() => toggleSkill(s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold">Test Mode</h2>
            <PillGroup options={TEST_MODES} value={testMode} onChange={(v) => setTestMode(v as "TRANSLATION" | "QUESTIONS")} />

            {testMode === "QUESTIONS" && (
              <>
                <Label className="block text-xs text-muted-foreground">Question Type</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUESTION_TYPES.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={questionTypes.includes(t.value)} onCheckedChange={() => toggleQuestionType(t.value)} />
                      {t.label}
                    </label>
                  ))}
                </div>
                <PillGroup
                  label="Number of Questions"
                  options={QUESTION_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(numQuestions)}
                  onChange={(v) => setNumQuestions(Number(v))}
                />
              </>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <Button className="w-full gap-2" size="lg" onClick={runGenerate} disabled={generate.isPending || !topic.trim()}>
          <Wand2 className="h-4 w-4" /> {generate.isPending ? "กำลังสร้าง..." : "Generate Listening Exercise"}
        </Button>
      </div>
    );
  }

  // ============ Render: waiting for the article to be persisted ============
  if (!articleId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        {createPassage.isError ? (
          <>
            <p className="text-destructive">{error ?? "บันทึกบทฟังไม่สำเร็จ"}</p>
            <Button variant="outline" onClick={backToSetup}>New Exercise</Button>
          </>
        ) : (
          <p>กำลังบันทึกบทฟัง...</p>
        )}
      </div>
    );
  }

  // ============ Render: Listening Workspace ============
  return (
    <ListeningWorkspace
      articleId={articleId}
      title={exerciseTitle}
      transcript={exercise.transcript}
      translation={exercise.translation}
      questions={(exercise.questions ?? []) as unknown as ReadingQuestion[]}
      testMode={testMode}
      metaLine={`${DIFFICULTY_LABELS[cefrLevel] ?? cefrLevel} · ${EXAM_MODES.find((m) => m.value === examMode)?.label ?? examMode}`}
      onBack={backToSetup}
      initialAccent={accent}
      initialVoice={voice}
      initialSpeed={speedToRate(speakingSpeed)}
    />
  );
}

function deriveTitle(topic: string, transcript: string): string {
  const t = topic.trim();
  if (t) return t.length > 60 ? `${t.slice(0, 60)}...` : t;
  const firstLine = (transcript ?? "").split("\n")[0]?.trim() ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine || "Listening Exercise";
}

function FieldLabel({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon}
      {text}
    </div>
  );
}

function OptionCard({
  active, onClick, icon, title, description,
}: { active: boolean; onClick: () => void; icon: ReactNode; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border",
          active ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function PillGroup({
  icon, label, options, value, onChange,
}: { icon?: ReactNode; label?: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {(icon || label) && <FieldLabel icon={icon} text={label ?? ""} />}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <PillButton key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>{o.label}</PillButton>
        ))}
      </div>
    </div>
  );
}

function PillButton({
  active, onClick, children, showCheck,
}: { active: boolean; onClick: () => void; children: ReactNode; showCheck?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
      {active && showCheck && <Check className="h-3 w-3" />}
    </button>
  );
}
