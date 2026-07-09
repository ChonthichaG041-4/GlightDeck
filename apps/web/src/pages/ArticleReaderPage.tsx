import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePassage, useMarkArticleRead } from "@/api/hooks";
import ReadingWorkspace from "@/components/reading/ReadingWorkspace";

// Reader for "My Articles" (the plain paste-your-own-text library) - these are
// rows in the same Article table as AI-generated/Create Mode passages, just
// without translation/questions/testMode set. Routing this through
// ReadingWorkspace (instead of a separate basic reader) means every article -
// wherever it came from - gets the same double-click dictionary popup,
// highlighting, notes, and bookmarks.
export default function ArticleReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: passage, isLoading } = usePassage(id);
  const markRead = useMarkArticleRead();

  useEffect(() => {
    if (id) markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading || !passage) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <ReadingWorkspace
      articleId={passage.id}
      title={passage.title}
      passage={passage.content}
      translation={passage.translation ?? undefined}
      questions={passage.questions}
      testMode={passage.testMode ?? "READING_ONLY"}
      metaLine={passage.cefrLevel ?? passage.category}
      onBack={() => navigate("/reading")}
      readOnly={passage.isOwner === false}
    />
  );
}
