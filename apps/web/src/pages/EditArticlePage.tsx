import { useParams } from "react-router-dom";
import CreateModeTab from "@/components/reading/CreateModeTab";

// Route: /article/:id/edit - editing an existing Article always uses the same
// manual editor as "Create Manually" (Reading vs. Listening is just a
// category on the same Article row, not a different editor).
export default function EditArticlePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <CreateModeTab editArticleId={id} />
    </div>
  );
}
