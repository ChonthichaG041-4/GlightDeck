import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, Headphones, Wand2, Sparkles, Pencil, Copy, Trash2,
  BarChart3, Clock, GraduationCap, ClipboardList, Lock, Link2, Globe, Tag as TagIcon, BookMarked, Eye, Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  usePassage, useUpdatePassage, useDeleteArticle, useDuplicatePassage,
  useVocabularyDetect, useGenerateQuestionsForPassage, useSubmitRating,
} from "@/api/hooks";
import { cn } from "@/lib/utils";

// ============================================================================
// Article Detail - the landing page for any article/exercise opened from the
// Articles hub (My Articles or Community). Shows the article's metadata at a
// glance and offers every entry point into it, instead of jumping straight
// into a reader/practice screen. Reuses usePassage (already the full DTO,
// including isOwner/stats) rather than a separate summary endpoint.
// ============================================================================

const WORDS_PER_MINUTE = 200;

const VISIBILITY_CONFIG: Record<string, { label: string; icon: typeof Lock; className: string }> = {
  PRIVATE: { label: "Private", icon: Lock, className: "bg-muted text-muted-foreground" },
  UNLISTED: { label: "Unlisted", icon: Link2, className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  PUBLIC: { label: "Public", icon: Globe, className: "bg-primary/10 text-primary" },
};

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: passage, isLoading } = usePassage(id);
  const updatePassage = useUpdatePassage();
  const deleteArticle = useDeleteArticle();
  const duplicatePassage = useDuplicatePassage();
  const vocabularyDetect = useVocabularyDetect();
  const generateQuestions = useGenerateQuestionsForPassage();
  const submitRating = useSubmitRating();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [vocabError, setVocabError] = useState<string | null>(null);

  if (isLoading || !passage) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const wordCount = passage.content.trim() ? passage.content.trim().split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  const vocabCount = passage.vocabulary?.length ?? 0;
  const questionCount = passage.questions?.length ?? 0;
  const preview = passage.content.trim().slice(0, 280) + (passage.content.trim().length > 280 ? "..." : "");
  const vis = VISIBILITY_CONFIG[passage.visibility] ?? VISIBILITY_CONFIG.PRIVATE;
  const VisIcon = vis.icon;

  function generateQuiz() {
    if (!passage) return;
    setQuizError(null);
    if (questionCount > 0) {
      navigate(`/reading/${passage.id}`);
      return;
    }
    generateQuestions.mutate(
      { passage: passage.content, targetLang: "th" },
      {
        onSuccess: (data) => {
          if (!data.questions?.length) {
            setQuizError(data.note ?? "สร้างคำถามไม่สำเร็จ ลองใหม่อีกครั้ง");
            return;
          }
          updatePassage.mutate(
            { id: passage.id, questions: data.questions, testMode: "QUESTIONS" },
            { onSuccess: () => navigate(`/reading/${passage.id}`) }
          );
        },
        onError: () => setQuizError("สร้างคำถามไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  function extractVocabulary() {
    if (!passage) return;
    setVocabError(null);
    vocabularyDetect.mutate(
      { passage: passage.content, targetLang: "th" },
      {
        onSuccess: (data) => {
          if (!data.vocabulary?.length) {
            setVocabError(data.note ?? "ไม่พบคำศัพท์ที่ดึงได้");
            return;
          }
          updatePassage.mutate({ id: passage.id, vocabulary: data.vocabulary, vocabularyMode: "AUTO" });
        },
        onError: () => setVocabError("ดึงคำศัพท์ไม่สำเร็จ ลองใหม่อีกครั้ง"),
      }
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", vis.className)}>
                <VisIcon className="h-3 w-3" /> {vis.label}
              </span>
              <span className="text-xs text-muted-foreground">{passage.category}</span>
              {!passage.isOwner && <span className="text-xs text-muted-foreground">· โดย {passage.authorName}</span>}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{passage.title}</h1>
            {passage.description && <p className="text-sm text-muted-foreground">{passage.description}</p>}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Preview</p>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{preview || "No content yet."}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat icon={BarChart3} label="Difficulty" value={passage.cefrLevel || "Auto"} />
            <Stat icon={Clock} label="Reading Time" value={`~${readingMinutes} min`} />
            <Stat icon={GraduationCap} label="Vocabulary" value={String(vocabCount)} />
            <Stat icon={ClipboardList} label="Questions" value={String(questionCount)} />
            <Stat icon={Eye} label="Views" value={String(passage.viewCount)} />
            <Stat icon={BookMarked} label="Study List" value={passage.category} />
          </div>

          {passage.tags && passage.tags.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <TagIcon className="h-3.5 w-3.5" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {passage.tags.map((t) => (
                  <span key={t} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-semibold">Actions</p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link to={`/reading/${passage.id}`}><BookOpen className="h-4 w-4" /> Start Reading</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link to={`/listening/${passage.id}`}><Headphones className="h-4 w-4" /> Start Listening</Link>
            </Button>
            {passage.isOwner && (
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={generateQuiz}
                disabled={generateQuestions.isPending || updatePassage.isPending}
              >
                <Wand2 className="h-4 w-4" /> {generateQuestions.isPending ? "กำลังสร้าง..." : "Generate Quiz"}
              </Button>
            )}
            {passage.isOwner && (
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={extractVocabulary}
                disabled={vocabularyDetect.isPending}
              >
                <Sparkles className="h-4 w-4" /> {vocabularyDetect.isPending ? "กำลังดึงคำศัพท์..." : "Extract Vocabulary"}
              </Button>
            )}
            {passage.isOwner && (
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link to={`/reading/${passage.id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
              </Button>
            )}
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => duplicatePassage.mutate(passage.id, { onSuccess: (d) => navigate(`/articles/${d.id}`) })}
              disabled={duplicatePassage.isPending}
            >
              <Copy className="h-4 w-4" /> {duplicatePassage.isPending ? "กำลังทำสำเนา..." : "Duplicate"}
            </Button>
            {passage.isOwner && (
              <Button
                variant="outline"
                className="justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>

          {quizError && <p className="text-xs text-destructive">{quizError}</p>}
          {vocabError && <p className="text-xs text-destructive">{vocabError}</p>}
        </CardContent>
      </Card>

      {!passage.isOwner && (
        <Card>
          <CardContent className="flex items-center justify-center gap-1 p-4">
            <span className="mr-2 text-sm text-muted-foreground">Rate this article:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => submitRating.mutate({ articleId: passage.id, rating: n })}>
                <Star
                  className={cn(
                    "h-5 w-5",
                    passage.stats.myRating && n <= passage.stats.myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                  )}
                />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{passage.title}"?</DialogTitle>
            <DialogDescription>
              This permanently deletes the article along with its questions, highlights, notes, and stats. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteArticle.isPending}
              onClick={() => deleteArticle.mutate(passage.id, { onSuccess: () => navigate("/articles") })}
            >
              {deleteArticle.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
