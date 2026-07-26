// "Generate with AI" tab of Create Practice (/create). Extracted from the old
// ReadingPage.tsx's ReadingGenerator so it can be shared as a top-level tab
// instead of being Reading-only. Generates a single reusable Article via
// useGenerateReadingExercise() - the same Article then supports both Reading
// Practice and Listening Practice (see ArticleDetailPage's "Start
// Reading"/"Start Listening" buttons), so this form intentionally has no
// voice/accent/speed fields - those are playback-time concerns that live in
// ListeningWorkspace instead.
import { useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wand2, BookOpen, Gem, BarChart3, PenLine, ClipboardPaste, FileUp, FileType, Link2, Lock,
  Ruler, Palette, GraduationCap, SpellCheck2, Target, ClipboardList,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useGenerateReadingExercise } from "@/api/hooks";
import { FieldLabel, OptionCard, PillButton } from "@/components/reading/primitives";
import { DIFFICULTY_CARDS, TEST_MODES, QUESTION_TYPES, QUESTION_COUNTS } from "@/components/reading/composerConstants";

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

const CONTENT_SOURCES: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string; enabled: boolean }[] = [
  { value: "AI_GENERATE", icon: Wand2, title: "AI Generate", description: "Let AI write fresh content", enabled: true },
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

// Merged Reading + Listening assessment taxonomy. Values map 1:1 onto the
// backend's existing READING_SKILLS enum (apps/server/src/routes/reading.ts)
// since we're not touching the API in this phase - AUTHOR_PURPOSE is relabeled
// "Speaker Purpose" to cover both reading and listening framing. Listening's
// own "Following Instructions" goal has no backend equivalent yet, so it's
// intentionally left out here rather than adding a new enum value.
const ASSESSMENT_GOALS = [
  { value: "MAIN_IDEA", label: "Main Idea" },
  { value: "DETAIL", label: "Detail" },
  { value: "INFERENCE", label: "Inference" },
  { value: "VOCAB_IN_CONTEXT", label: "Vocabulary in Context" },
  { value: "GRAMMAR", label: "Grammar" },
  { value: "AUTHOR_PURPOSE", label: "Speaker Purpose" },
  { value: "SEQUENCING", label: "Sequencing" },
  { value: "TONE", label: "Tone / Emotion" },
  { value: "REFERENCE", label: "Reference" },
  { value: "MIXED", label: "Mixed" },
];

export default function ExerciseGenerator() {
  const navigate = useNavigate();

  // ---- Setup state ----
  const [topic, setTopic] = useState("");
  const [contentSource, setContentSource] = useState("AI_GENERATE");
  const [manualText, setManualText] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [examMode, setExamMode] = useState("GENERAL_ENGLISH");
  const [cefrLevel, setCefrLevel] = useState("AUTO");
  const [length, setLength] = useState("MEDIUM");
  const [customWordCount, setCustomWordCount] = useState(500);
  const [styles, setStyles] = useState<string[]>(["MIXED"]);
  const [vocabLevel, setVocabLevel] = useState("AUTO");
  const [grammarFocus, setGrammarFocus] = useState<string[]>(["MIXED"]);
  const [assessmentGoals, setAssessmentGoals] = useState<string[]>(["MIXED"]);
  const [testMode, setTestMode] = useState("QUESTIONS");
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MIXED"]);
  const [numQuestions, setNumQuestions] = useState<number | "CUSTOM">(10);
  const [numQuestionsCustom, setNumQuestionsCustom] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const generate = useGenerateReadingExercise();

  const isManualSource = contentSource === "WRITE_MYSELF" || contentSource === "IMPORT_TEXT";

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
    if (contentSource === "AI_GENERATE" && !topic.trim()) {
      setError("กรอกหัวข้อที่ต้องการสร้างก่อน");
      return;
    }
    if (isManualSource && !manualText.trim()) {
      setError("วางหรือพิมพ์ข้อความที่ต้องการใช้ก่อน");
      return;
    }
    setError(null);
    generate.mutate(
      {
        topic: topic.trim(),
        passageSource: contentSource,
        manualText: manualText.trim(),
        description: description.trim(),
        tags,
        cefrLevel,
        examMode,
        length,
        customWordCount,
        styles,
        vocabLevel,
        grammarFocus,
        readingSkills: assessmentGoals,
        testMode,
        questionTypes,
        numQuestions: numQuestions === "CUSTOM" ? numQuestionsCustom : numQuestions,
        targetLang: "th",
      },
      {
        onSuccess: (data) => {
          if (!data.exercise || !data.articleId) {
            setError(data.note ?? "สร้างบทความไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          // The Article is created and ready for both Reading and Listening
          // practice - hand off to Article Detail so the user picks how to
          // start, instead of forcing a Reading-only preview here.
          navigate(`/article/${data.articleId}`);
        },
        onError: () => setError("สร้างบทความไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  const showQuestions = ["QUESTIONS", "VOCABULARY", "GRAMMAR", "MIXED"].includes(testMode);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">1. Content Setup</h2>
              <p className="text-xs text-muted-foreground">Configure the article this exercise is built from</p>
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
            <FieldLabel icon={<Wand2 className="h-4 w-4" />} text="Content Source" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CONTENT_SOURCES.map((p) => (
                <OptionCard
                  key={p.value}
                  active={contentSource === p.value}
                  onClick={() => p.enabled && setContentSource(p.value)}
                  icon={<p.icon className="h-5 w-5" />}
                  title={p.title}
                  description={p.description}
                  disabled={!p.enabled}
                  badge={!p.enabled ? <Lock className="h-3 w-3" /> : undefined}
                />
              ))}
            </div>
          </div>

          {contentSource === "AI_GENERATE" && (
            <div>
              <FieldLabel icon={<BookOpen className="h-4 w-4" />} text="Topic" />
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder='e.g. "Climate Change", "Ordering Food", "Business Meeting", "Daily Conversation"'
              />
              <p className="mt-1 text-xs text-muted-foreground">Enter a topic or theme for your article</p>
            </div>
          )}

          {isManualSource && (
            <div>
              <FieldLabel icon={<PenLine className="h-4 w-4" />} text={contentSource === "WRITE_MYSELF" ? "Write your text" : "Paste your text"} />
              <textarea
                className="h-40 w-full rounded-md border p-3 text-sm"
                placeholder={contentSource === "WRITE_MYSELF" ? "เขียนเนื้อหาที่ต้องการที่นี่..." : "วางข้อความที่มีอยู่แล้วที่นี่..."}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
            </div>
          )}

          <div>
            <FieldLabel text="Description (optional)" />
            <textarea
              className="h-16 w-full rounded-md border p-2 text-sm"
              placeholder="สรุปสั้น ๆ ว่าบทความนี้เกี่ยวกับอะไร..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel text="Tags (optional)" />
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="text-muted-foreground hover:text-destructive">×</button>
                </span>
              ))}
              <input
                className="min-w-[80px] flex-1 border-0 bg-transparent text-xs outline-none"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const t = tagDraft.trim();
                    if (t && !tags.includes(t)) setTags([...tags, t]);
                    setTagDraft("");
                  }
                }}
                placeholder={tags.length ? "" : "พิมพ์แล้วกด Enter..."}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <FieldLabel icon={<Ruler className="h-4 w-4" />} text="2. Length" />
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
          <FieldLabel icon={<Palette className="h-4 w-4" />} text="3. Content Style" />
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
          <FieldLabel icon={<Target className="h-4 w-4" />} text="6. Assessment Goals" />
          <p className="text-xs text-muted-foreground">ใช้ได้ทั้ง Reading Practice และ Listening Practice</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ASSESSMENT_GOALS.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={assessmentGoals.includes(s.value)} onCheckedChange={() => toggleMulti(assessmentGoals, setAssessmentGoals, s.value)} />
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
        <Wand2 className="h-4 w-4" /> {generate.isPending ? "กำลังสร้าง..." : "Generate Article"}
      </Button>
    </div>
  );
}
