import { useEffect, useState, type ComponentType } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, BookText, Wand2,
  BookOpen, Gem, BarChart3, PenLine, ClipboardPaste, FileUp, FileType, Link2, Lock, Globe, Trash2, Pencil,
  Ruler, Palette, GraduationCap, SpellCheck2, Target, ClipboardList, Headphones,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useArticles, useCreateArticle, useDeleteArticle, useGenerateReadingExercise, type ReadingExercise } from "@/api/hooks";
import ReadingWorkspace from "@/components/reading/ReadingWorkspace";
import CreateModeTab from "@/components/reading/CreateModeTab";
import CommunityTab from "@/components/reading/CommunityTab";
import { FieldLabel, OptionCard, PillButton } from "@/components/reading/primitives";
import { DIFFICULTY_CARDS, DIFFICULTY_LABELS, TEST_MODES, QUESTION_TYPES, QUESTION_COUNTS } from "@/components/reading/composerConstants";
import { cn } from "@/lib/utils";
import type { Article } from "@/types";

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

type ReadingTab = "generate" | "create" | "community" | "library";

const VALID_TABS: ReadingTab[] = ["generate", "create", "community", "library"];

export default function ReadingPage() {
  const { id: editArticleId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as ReadingTab | null;
  const [tab, setTab] = useState<ReadingTab>(
    editArticleId ? "create" : tabParam && VALID_TABS.includes(tabParam) ? tabParam : "generate"
  );

  // Navigating directly between two /reading/:id/edit URLs keeps this page
  // mounted (only the param changes), so make sure the Create tab stays
  // selected any time an edit id is present, not just on first mount.
  useEffect(() => {
    if (editArticleId) setTab("create");
  }, [editArticleId]);

  // A save-and-return-to-My-Articles redirect (from editing an article) lands
  // on /reading?tab=library - pick that up even if this page instance happens
  // to stay mounted (e.g. future navigation changes) rather than only on init.
  useEffect(() => {
    if (!editArticleId && tabParam && VALID_TABS.includes(tabParam)) setTab(tabParam);
  }, [tabParam, editArticleId]);

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
      {tab === "create" && <CreateModeTab editArticleId={editArticleId} />}
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
              <ArticleCard key={a.id} article={a} />
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

const VISIBILITY_CONFIG: Record<string, { label: string; icon: ComponentType<{ className?: string }>; className: string }> = {
  PRIVATE: { label: "Private", icon: Lock, className: "bg-muted text-muted-foreground" },
  UNLISTED: { label: "Unlisted", icon: Link2, className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  PUBLIC: { label: "Public", icon: Globe, className: "bg-primary/10 text-primary" },
};

function ArticleCard({ article }: { article: Article }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteArticle = useDeleteArticle();

  const vis = VISIBILITY_CONFIG[article.visibility ?? "PRIVATE"] ?? VISIBILITY_CONFIG.PRIVATE;
  const VisIcon = vis.icon;

  return (
    <>
      <Card className="group relative transition-shadow hover:shadow-md">
        <Link to={`/reading/${article.id}`} className="block">
          <CardContent className="flex items-center gap-3 p-4 pr-11">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <BookText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{article.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", vis.className)}>
                  <VisIcon className="h-3 w-3" /> {vis.label}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(article.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Link>
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Link
            to={`/listening/${article.id}`}
            aria-label="Test Listening"
            title="Test Listening"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Headphones className="h-4 w-4" />
          </Link>
          <Link
            to={`/reading/${article.id}/edit`}
            aria-label="Edit article"
            title="Edit"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            aria-label="Delete article"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{article.title}"?</DialogTitle>
            <DialogDescription>
              This permanently deletes the article along with its questions, highlights, notes, and stats. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteArticle.isPending}
              onClick={() => deleteArticle.mutate(article.id, { onSuccess: () => setConfirmOpen(false) })}
            >
              {deleteArticle.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
        description: description.trim(),
        tags,
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


