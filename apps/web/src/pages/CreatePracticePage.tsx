import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExerciseGenerator from "@/components/reading/ExerciseGenerator";
import CreateModeTab from "@/components/reading/CreateModeTab";

// Route: /create (also /article/new) - replaces the old top-level Reading and
// Listening pages. Every article made here supports both Reading Practice and
// Listening Practice; which one to start happens later, from Article Detail.
type CreateTab = "generate" | "create";

const VALID_TABS: CreateTab[] = ["generate", "create"];

export default function CreatePracticePage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as CreateTab | null;
  const [tab, setTab] = useState<CreateTab>(tabParam && VALID_TABS.includes(tabParam) ? tabParam : "generate");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">✨ Create Practice</h1>
        <p className="text-sm text-muted-foreground">
          Build an article once - practice it as Reading or Listening later. Saved articles show up in Articles - My Articles.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CreateTab)}>
        <TabsList>
          <TabsTrigger value="generate">Generate with AI</TabsTrigger>
          <TabsTrigger value="create">Create Manually</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "generate" && <ExerciseGenerator />}
      {tab === "create" && <CreateModeTab />}
    </div>
  );
}
