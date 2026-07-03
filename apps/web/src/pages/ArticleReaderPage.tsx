import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useArticle, useMarkArticleRead, useAiExplain, useCreateWord } from "@/api/hooks";

export default function ArticleReaderPage() {
  const { id } = useParams();
  const { data: article, isLoading } = useArticle(id);
  const markRead = useMarkArticleRead();
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const explain = useAiExplain();
  const createWord = useCreateWord();

  useEffect(() => {
    if (id) markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function onWordClick(word: string) {
    const clean = word.replace(/[^a-zA-Z'-]/g, "");
    if (!clean) return;
    setActiveWord(clean);
    explain.mutate(clean);
  }

  function addToVocabulary() {
    if (!activeWord) return;
    createWord.mutate(
      { headword: activeWord, meaning: explain.data?.meaning ?? "" },
      { onSuccess: () => setActiveWord(null) }
    );
  }

  if (isLoading || !article) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/reading" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Reading
      </Link>

      <Card>
        <CardContent className="p-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">{article.category}</p>
          <h1 className="mb-4 text-2xl font-bold">{article.title}</h1>
          <p className="leading-8">
            {article.content?.split(/(\s+)/).map((chunk, i) =>
              /\s+/.test(chunk) ? (
                <span key={i}>{chunk}</span>
              ) : (
                <span
                  key={i}
                  className="cursor-pointer rounded px-0.5 hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onWordClick(chunk)}
                >
                  {chunk}
                </span>
              )
            )}
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!activeWord} onOpenChange={(o) => !o && setActiveWord(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="capitalize">{activeWord}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Meaning</p>
              <p>{explain.isPending ? "..." : explain.data?.meaning ?? "-"}</p>
            </div>
            <Button className="w-full gap-2" onClick={addToVocabulary} disabled={createWord.isPending}>
              <Plus className="h-4 w-4" /> Add to Vocabulary
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
