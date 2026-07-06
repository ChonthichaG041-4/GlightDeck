import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Plus, BookText, Wand2,
  BookOpen, Gem, BarChart3, PenLine, ClipboardPaste, FileUp, FileType, Link2, Lock,
  Ruler, Palette, GraduationCap, SpellCheck2, Target, ClipboardList,
  Sparkles, Sprout, Book, MessageCircle, TrendingUp, Star, Crown, Shuffle, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useArticles, useCreateArticle, useGenerateReadingExercise, type ReadingExercise } from "@/api/hooks";
import ReadingWorkspace from "@/components/reading/ReadingWorkspace";
import CreateModeTab from "@/components/reading/CreateModeTab";
import CommunityTab from "@/components/reading/CommunityTab";
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

const EXAM_MODES = [
  { value: "GENERAL_ENGLISH", label: "General English" },
  { value: "IELTS", label: "IELTS" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "TOEIC", label: "TOEIC" },
  { value: "CU_TEP", label: "CU-TEP" },
  { value: "TU_GET", label: "TU-GET" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "KIDS", label: "Kids" },
];

const PASSAGE_SOURCES: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string; enabled: boolean }[] = [
  { value: "AI_GENERATE", icon: Wand2, title: "AI Generate", description: "Let AI write a fresh passage", enabled: true },
  { value: "WRITE_MYSELF", icon: PenLine, title: "Write Myself", description: "Compose your own text now", enabled: true },
  { value: "IMPORT_TEXT", icon: ClipboardPaste, title: "Import Text", description: "Paste text you already have", enabled: true },
  { value: "UPLOAD_PDF", icon: FileUp, title: "Upload PDF", description: "Coming soon", enabled: false },
  { value: "UPLOAD_DOCX", icon: FileType, title: "Upload DOCX", description: "Coming soon", enabled: false },
  { value: "WEB_URL", icon: Link2, title: "Web Article URL", description: "Coming soon", enabled: false },
];

const LENGTHS = [
  { value: "SHORT", title: "Short", description: "200-300 words" },
  { value: "MEDIUM", title: "Medium", description: "400-700 words" },
  { value: "LONG", title: "Long", description: "800-1500 words" },
  { value: "CUSTOM", title: "Custom", description: "Set exact word count" },
];

const STYLES = [
  { value: "STORY", label: "Story" },
  { value: "NEWS", label: "News" },
  { value: "CONVERSATION", label: "Conversation" },
  { value: "EMAIL", label: "Email" },
  { value: "ARTICLE", label: "Article" },
  { value: "BLOG", label: "Blog" },
  { value: "RESEARCH", label: "Research" },
  { value: "FANTASY", label: "Fantasy" },
  { value: "BUSINESS", label: "Business" },
  { value: "TRAVEL", label: "Travel" },
  { value: "MIXED", label: "Mixed" },
];

const VOCAB_LEVELS = [
  { value: "AUTO", label: "Auto" },
  { value: "SIMPLE", label: "Simple Vocabulary" },
  { value: "ACADEMIC", label: "Academic Vocabulary" },
  { value: "BUSINESS", label: "Business Vocabulary" },
  { value: "DAILY", label: "Daily English" },
  { value: "MIXED", label: "Mixed" },
];

const GRAMMAR_FOCUS = [
  { value: "PRESENT_SIMPLE", label: "Present Simple" },
  { value: "PAST_TENSE", label: "Past Tense" },
  { value: "FUTURE", label: "Future" },
  { value: "PASSIVE", label: "Passive" },
  { value: "CONDITIONALS", label: "Conditionals" },
  { value: "RELATIVE_CLAUSE", label: "Relative Clause" },
  { value: "REPORTED_SPEECH", label: "Reported Speech" },
  { value: "PHRASAL_VERB", label: "Phrasal Verb" },
  { value: "IDIOMS", label: "Idioms" },
  { value: "MIXED", label: "Mixed" },
];

const READING_SKILLS = [
  { value: "MAIN_IDEA", label: "Main Idea" },
  { value: "DETAIL", label: "Detail" },
  { value: "INFERENCE", label: "Inference" },
  { value: "VOCAB_IN_CONTEXT", label: "Vocabulary in Context" },
  { value: "TONE", label: "Tone" },
  { value: "AUTHOR_PURPOSE", label: "Author Purpose" },
  { value: "SEQUENCING", label: "Sequencing" },
  { value: "REFERENCE", label: "Reference" },
  { value: "GRAMMAR", label: "Grammar" },
  { value: "MIXED", label: "Mixed" },
];

const TEST_MODES = [
  { value: "READING_ONLY", label: "Reading Only" },
  { value: "TRANSLATION", label: "Reading + Translation" },
  { value: "QUESTIONS", label: "Reading + Questions" },
  { value: "VOCABULARY", label: "Reading + Vocabulary" },
  { value: "GRAMMAR", label: "Reading + Grammar" },
  { value: "MIXED", label: "Mixed" },
];

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "YES_NO_NOTGIVEN", label: "Yes / No / Not Given" },
  { value: "FILL_BLANK", label: "Fill in the Blank" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "MATCHING", label: "Matching" },
  { value: "ORDERING", label: "Ordering" },
  { value: "ESSAY", label: "Essay" },
  { value: "HIGHLIGHT_SENTENCE", label: "Highlight Sentence" },
  { value: "CLICK_WORD", label: "Click Word" },
  { value: "MIXED", label: "Mixed" },
];
const QUESTION_COUNTS = [5, 10, 15, 20];

type ReadingTab = "generate" | "create" | "community" | "library";

export default function ReadingPage() {
  const [tab, setTab] = useState<ReadingTab>("generate");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📖 Reading Practice</h1>
        <p className="text-sm text-muted-foreground">Build a custom AI reading exercise, write your own, or explore the community.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReadingTab)}>
        <TabsList>
          <TabsTrigger value="generate">Generate with AI</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="library">My Articles</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "generate" && <ReadingGenerator />}
      {tab === "create" && <CreateModeTab />}
      {tab === "community" && <CommunityTab />}
      {tab === "library" && <ArticleLibrary />}
    </div>
  );
}

// ============================================================================
// Tab 2: My Articles (existing paste-your-own-text gallery, unchanged)
// ============================================================================

function ArticleLibrary() {
  const { data: articles, isLoading } = useArticles();
  const categories = Array.from(new Set(articles?.map((a) => a.category) ?? []));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AddArticleDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {categories.map((category) => (
        <div key={category}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{category}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {articles?.filter((a) => a.category === category).map((a) => (
              <Link key={a.id} to={`/reading/${a.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <BookText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {!isLoading && articles?.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No articles yet - add your first one.</p>
      )}
    </div>
  );
}

function AddArticleDialog() {
  const [open, setOpen] = useState(false);
  const createArticle = useCreateArticle();
  const [form, setForm] = useState({ title: "", category: "News", content: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Article</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an article</DialogTitle>
          <DialogDescription>Paste any text - Harry Potter, game articles, news, novels...</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Harry Potter, Game Articles, News, Novel" /></div>
          <div>
            <Label>Content</Label>
            <textarea
              className="h-40 w-full rounded-md border p-2 text-sm"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => createArticle.mutate(form, { onSuccess: () => { setOpen(false); setForm({ title: "", category: "News", content: "" }); } })}
          >
            Save article
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Tab 1: Generate with AI - Setup wizard + basic read/answer practice view
// ============================================================================

function ReadingGenerator() {
  // ---- Setup state ----
  const [topic, setTopic] = useState("");
  const [passageSource, setPassageSource] = useState("AI_GENERATE");
  const [manualText, setManualText] = useState("");
  const [examMode, setExamMode] = useState("GENERAL_ENGLISH");
  const [cefrLevel, setCefrLevel] = useState("AUTO");
  const [length, setLength] = useState("MEDIUM");
  const [customWordCount, setCustomWordCount] = useState(500);
  const [styles, setStyles] = useState<string[]>(["MIXED"]);
  const [vocabLevel, setVocabLevel] = useState("AUTO");
  const [grammarFocus, setGrammarFocus] = useState<string[]>(["MIXED"]);
  const [readingSkills, setReadingSkills] = useState<string[]>(["MIXED"]);
  const [testMode, setTestMode] = useState("QUESTIONS");
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MIXED"]);
  const [numQuestions, setNumQuestions] = useState<number | "CUSTOM">(10);
  const [numQuestionsCustom, setNumQuestionsCustom] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const generate = useGenerateReadingExercise();

  // ---- Practice state ----
  const [exercise, setExercise] = useState<ReadingExercise | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);

  const isManualSource = passageSource === "WRITE_MYSELF" || passageSource === "IMPORT_TEXT";

  function toggleMulti(list: string[], setList: (v: string[]) => void, value: string) {
    if (value === "MIXED") {
      setList(list.includes("MIXED") ? [] : ["MIXED"]);
      return;
    }
    const withoutMixed = list.filter((s) => s !== "MIXED");
    const next = withoutMixed.includes(value) ? withoutMixed.filter((s) => s !== value) : [...withoutMixed, value];
    setList(next.length ? next : ["MIXED"]);
  }

  function runGenerate() {
    if (passageSource === "AI_GENERATE" && !topic.trim()) {
      setError("กรอกหัวข้อที่ต้องการอ่านก่อน");
      return;
    }
    if (isManualSource && !manualText.trim()) {
      setError("วางหรือพิมพ์ข้อความที่ต้องการอ่านก่อน");
      return;
    }
    setError(null);
    generate.mutate(
      {
        topic: topic.trim(),
        passageSource,
        manualText: manualText.trim(),
        cefrLevel,
        examMode,
        length,
        customWordCount,
        styles,
        vocabLevel,
        grammarFocus,
        readingSkills,
        testMode,
        questionTypes,
        numQuestions: numQuestions === "CUSTOM" ? numQuestionsCustom : numQuestions,
        targetLang: "th",
      },
      {
        onSuccess: (data) => {
          if (!data.exercise) {
            setError(data.note ?? "สร้างบทอ่านไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          setExercise(data.exercise);
          setArticleId(data.articleId ?? null);
        },
        onError: () => setError("สร้างบทอ่านไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  function backToSetup() {
    setExercise(null);
    setArticleId(null);
  }

  const showQuestions = ["QUESTIONS", "VOCABULARY", "GRAMMAR", "MIXED"].includes(testMode);

  // ============ Render: Setup wizard ============
  if (!exercise) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">1. Reading Setup</h2>
                <p className="text-xs text-muted-foreground">Configure your reading practice</p>
              </div>
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
              <FieldLabel icon={<Wand2 className="h-4 w-4" />} text="Passage Source" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PASSAGE_SOURCES.map((p) => (
                  <OptionCard
                    key={p.value}
                    active={passageSource === p.value}
                    onClick={() => p.enabled && setPassageSource(p.value)}
                    icon={<p.icon className="h-5 w-5" />}
                    title={p.title}
                    description={p.description}
                    disabled={!p.enabled}
                    badge={!p.enabled ? <Lock className="h-3 w-3" /> : undefined}
                  />
                ))}
              </div>
            </div>

            {passageSource === "AI_GENERATE" && (
              <div>
                <FieldLabel icon={<BookOpen className="h-4 w-4" />} text="Topic" />
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder='e.g. "Climate Change", "Magic Forest", "Business Meeting", "Daily Conversation"'
                />
                <p className="mt-1 text-xs text-muted-foreground">Enter a topic or theme for your reading passage</p>
              </div>
            )}

            {isManualSource && (
              <div>
                <FieldLabel icon={<PenLine className="h-4 w-4" />} text={passageSource === "WRITE_MYSELF" ? "Write your text" : "Paste your text"} />
                <textarea
                  className="h-40 w-full rounded-md border p-3 text-sm"
                  placeholder={passageSource === "WRITE_MYSELF" ? "เขียนเนื้อหาที่ต้องการฝึกอ่านที่นี่..." : "วางข้อความที่มีอยู่แล้วที่นี่..."}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <FieldLabel icon={<Ruler className="h-4 w-4" />} text="2. Reading Length" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LENGTHS.map((l) => (
                <OptionCard key={l.value} active={length === l.value} onClick={() => setLength(l.value)} title={l.title} description={l.description} />
              ))}
            </div>
            {length === "CUSTOM" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Word Count</Label>
                <Input
                  type="number"
                  min={50}
                  max={3000}
                  className="w-28"
                  value={customWordCount}
                  onChange={(e) => setCustomWordCount(Math.max(50, Number(e.target.value) || 50))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <FieldLabel icon={<Palette className="h-4 w-4" />} text="3. Reading Style" />
            <p className="text-xs text-muted-foreground">สามารถเลือกหลายอัน</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <PillButton key={s.value} active={styles.includes(s.value)} onClick={() => toggleMulti(styles, setStyles, s.value)} showCheck>
                  {s.label}
                </PillButton>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <FieldLabel icon={<GraduationCap className="h-4 w-4" />} text="4. Vocabulary Level" />
            <div className="flex flex-wrap gap-1.5">
              {VOCAB_LEVELS.map((v) => (
                <PillButton key={v.value} active={vocabLevel === v.value} onClick={() => setVocabLevel(v.value)}>{v.label}</PillButton>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <FieldLabel icon={<SpellCheck2 className="h-4 w-4" />} text="5. Grammar Focus" />
            <p className="text-xs text-muted-foreground">เลือกสิ่งที่ AI จะใส่เข้าไป</p>
            <div className="flex flex-wrap gap-1.5">
              {GRAMMAR_FOCUS.map((g) => (
                <PillButton key={g.value} active={grammarFocus.includes(g.value)} onClick={() => toggleMulti(grammarFocus, setGrammarFocus, g.value)} showCheck>
                  {g.label}
                </PillButton>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <FieldLabel icon={<Target className="h-4 w-4" />} text="6. Reading Goals" />
            <Label className="block text-xs text-muted-foreground">Reading Skill</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {READING_SKILLS.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={readingSkills.includes(s.value)} onCheckedChange={() => toggleMulti(readingSkills, setReadingSkills, s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <FieldLabel icon={<ClipboardList className="h-4 w-4" />} text="7. Test Mode" />
            <div className="flex flex-wrap gap-1.5">
              {TEST_MODES.map((t) => (
                <PillButton key={t.value} active={testMode === t.value} onClick={() => setTestMode(t.value)}>{t.label}</PillButton>
              ))}
            </div>

            {showQuestions && (
              <>
                <Label className="block text-xs text-muted-foreground">Question Type</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUESTION_TYPES.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={questionTypes.includes(t.value)} onCheckedChange={() => toggleMulti(questionTypes, setQuestionTypes, t.value)} />
                      {t.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Matching, Ordering, Essay, Highlight Sentence และ Click Word จะแสดงผลเป็น Multiple Choice ไปก่อน
                  (แบบฝึกหัดเชิงโต้ตอบสำหรับประเภทเหล่านี้กำลังพัฒนา)
                </p>

                <Label className="block text-xs text-muted-foreground">Number of Questions</Label>
                <div className="flex flex-wrap gap-1.5">
                  {QUESTION_COUNTS.map((n) => (
                    <PillButton key={n} active={numQuestions === n} onClick={() => setNumQuestions(n)}>{n}</PillButton>
                  ))}
                  <PillButton active={numQuestions === "CUSTOM"} onClick={() => setNumQuestions("CUSTOM")}>กำหนดเอง</PillButton>
                </div>
                {numQuestions === "CUSTOM" && (
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    className="w-28"
                    value={numQuestionsCustom}
                    onChange={(e) => setNumQuestionsCustom(Math.max(1, Number(e.target.value) || 1))}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <Button className="w-full gap-2" size="lg" onClick={runGenerate} disabled={generate.isPending}>
          <Wand2 className="h-4 w-4" /> {generate.isPending ? "กำลังสร้าง..." : "Generate Reading"}
        </Button>
      </div>
    );
  }

  // ============ Render: Reading Workspace ============
  if (!articleId) {
    // Shouldn't normally happen (server always persists a passage), but guard anyway.
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">ไม่พบรหัสบทความที่บันทึกไว้ ลอง Generate ใหม่อีกครั้ง</p>
        <Button onClick={backToSetup}>New Exercise</Button>
      </div>
    );
  }

  return (
    <ReadingWorkspace
      articleId={articleId}
      title={exercise.title}
      passage={exercise.passage}
      translation={exercise.translation}
      questions={exercise.questions}
      testMode={testMode}
      metaLine={`${DIFFICULTY_LABELS[cefrLevel] ?? cefrLevel} · ${EXAM_MODES.find((m) => m.value === examMode)?.label ?? examMode}`}
      onBack={backToSetup}
    />
  );
}

// ============================================================================
// Shared small UI primitives (mirrors the same pattern used on ListeningPage)
// ============================================================================

function FieldLabel({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon}
      {text}
    </div>
  );
}

function OptionCard({
  active, onClick, icon, title, description, disabled, badge,
}: { active: boolean; onClick: () => void; icon?: ReactNode; title: string; description: string; disabled?: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : active ? "border-primary bg-primary/5" : "hover:bg-accent"
      )}
    >
      {badge && <span className="absolute right-2 top-2 text-muted-foreground">{badge}</span>}
      {!disabled && (
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border",
            active ? "border-primary bg-primary" : "border-muted-foreground/40"
          )}
        >
          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
      )}
      {icon && <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{icon}</span>}
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
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

