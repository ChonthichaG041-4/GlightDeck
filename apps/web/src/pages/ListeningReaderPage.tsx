import { useNavigate, useParams } from "react-router-dom";
import { usePassage } from "@/api/hooks";
import ListeningWorkspace from "@/components/listening/ListeningWorkspace";

// Route: /listening/:id - "Test Listening" from a Reading article, or opening
// a listening exercise from Listening's own Community/My Articles tabs, all
// land here. Same underlying Article as Reading (shared system) - this view
// just plays its content back via TTS instead of rendering it to read.
export default function ListeningReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: passage, isLoading } = usePassage(id);

  if (isLoading || !passage) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <ListeningWorkspace
      articleId={passage.id}
      title={passage.title}
      transcript={passage.content}
      translation={passage.translation ?? undefined}
      questions={passage.questions}
      testMode={passage.testMode ?? "QUESTIONS"}
      metaLine={passage.cefrLevel ?? passage.category}
      onBack={() => navigate("/listening")}
      readOnly={passage.isOwner === false}
    />
  );
}
