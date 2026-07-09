import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleLibrary } from "@/components/articles/ArticleLibrary";
import CommunityTab from "@/components/articles/CommunityTab";

// ============================================================================
// Articles hub - the central content library (Phase 1 of the Articles-hub IA
// refactor). "My Articles" and "Community" used to be duplicated as tabs
// inside both ReadingPage.tsx and ListeningPage.tsx; they now live here once,
// shared by both practice modes. Reading/Listening still keep their own
// copies of these tabs for now (removed in Phase 2) so nothing breaks while
// this page is verified.
// ============================================================================

type ArticlesTab = "library" | "community";

const VALID_TABS: ArticlesTab[] = ["library", "community"];

export default function ArticlesPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as ArticlesTab | null;
  const [tab, setTab] = useState<ArticlesTab>(tabParam && VALID_TABS.includes(tabParam) ? tabParam : "library");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📚 Articles</h1>
        <p className="text-sm text-muted-foreground">
          Your content hub - every article you've created or saved, plus what the community has shared. Use one from
          here to start a Reading or Listening practice session.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ArticlesTab)}>
        <TabsList>
          <TabsTrigger value="library">My Articles</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "library" && <ArticleLibrary />}
      {tab === "community" && <CommunityTab />}
    </div>
  );
}
