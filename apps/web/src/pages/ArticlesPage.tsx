import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, FileText, Plus, Sparkles, Wand2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArticleLibrary, AddArticleDialog } from "@/components/articles/ArticleLibrary";
import CommunityTab from "@/components/articles/CommunityTab";

// ============================================================================
// Articles hub - the central content library. "My Articles" and "Community"
// live here as the single shared entry point into a user's saved/created
// content and what the community has shared (Reading/Listening are practice
// modes only - see Phase 2 of the Articles-hub IA refactor).
// ============================================================================

type ArticlesTab = "library" | "community";

const VALID_TABS: ArticlesTab[] = ["library", "community"];

export default function ArticlesPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as ArticlesTab | null;
  const [tab, setTab] = useState<ArticlesTab>(tabParam && VALID_TABS.includes(tabParam) ? tabParam : "library");
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {/* <ArticlesIllustration className="hidden h-16 w-16 shrink-0 sm:block" /> */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
            <p className="text-sm text-muted-foreground">
              Your content hub — every article you've created or saved, plus what the community has shared.
            </p>
          </div>
        </div>
        <AddArticleSplitButton onPasteText={() => setAddOpen(true)} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ArticlesTab)}>
        <TabsList>
          <TabsTrigger value="library">My Articles</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "library" && <ArticleLibrary onRequestAdd={() => setAddOpen(true)} />}
      {tab === "community" && <CommunityTab />}

      <AddArticleDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddArticleSplitButton({ onPasteText }: { onPasteText: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <div className="flex overflow-hidden rounded-lg">
        <Button className="gap-2 rounded-r-none" onClick={onPasteText}>
          <Plus className="h-4 w-4" /> Add Article
        </Button>
        <button
          type="button"
          aria-label="More ways to add an article"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center border-l border-primary-foreground/20 bg-primary px-2 text-primary-foreground hover:bg-primary/90"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-lg">
            <button
              type="button"
              onClick={() => { setOpen(false); onPasteText(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
            >
              <FileText className="h-4 w-4" /> Paste Text
            </button>
            <Link
              to="/reading?tab=generate"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent"
            >
              <Sparkles className="h-4 w-4" /> Generate with AI
            </Link>
            <Link
              to="/reading?tab=create"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent"
            >
              <Wand2 className="h-4 w-4" /> Create / Import
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ArticlesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" className="fill-primary/10" />
      <rect x="15" y="30" width="26" height="18" rx="2" className="fill-amber-400" transform="rotate(-8 15 30)" />
      <rect x="20" y="24" width="26" height="18" rx="2" className="fill-primary" transform="rotate(4 20 24)" />
      <rect x="23" y="27" width="20" height="12" rx="1" className="fill-white/90" transform="rotate(4 23 27)" />
      <circle cx="48" cy="18" r="5" className="fill-emerald-400" />
      <rect x="45.5" y="18" width="5" height="10" rx="2" className="fill-emerald-500" />
    </svg>
  );
}
