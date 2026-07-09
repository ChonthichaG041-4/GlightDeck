import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Plus, BookText, Lock, Link2, Globe, Trash2, Pencil, Headphones, Search,
  Tag as TagIcon, Archive, ArchiveRestore, ListPlus, X, FolderPlus, Folder, FolderOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  useArticles, useCreateArticle, useDeleteArticle, useUpdatePassage,
  useStudyLists, useCreateStudyList, useDeleteStudyList,
  useAddArticleToStudyList, useRemoveArticleFromStudyList,
  type StudyList,
} from "@/api/hooks";
import { cn } from "@/lib/utils";
import type { Article } from "@/types";

// ============================================================================
// "My Articles" - the Articles hub's own-content view. Per the Articles-hub
// IA, Category is NOT a filter/grouping here (Category is Community-only) -
// instead: Study Lists (user-created groupings), Tags, status (Draft/
// Published/Archived), search, and sort.
// ============================================================================

type StatusFilter = "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
const STATUS_LABELS: Record<StatusFilter, string> = { ALL: "All", DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };
type SortOption = "newest" | "oldest" | "title";

export function ArticleLibrary() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [studyListId, setStudyListId] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("newest");

  const { data: studyLists } = useStudyLists();
  const createStudyList = useCreateStudyList();
  const deleteStudyList = useDeleteStudyList();

  const { data: articles, isLoading } = useArticles({
    search: debouncedSearch || undefined,
    tags: activeTags.length ? activeTags : undefined,
    studyListId: studyListId ?? undefined,
    status: status === "ALL" ? undefined : status,
    sort,
  });

  const allTags = Array.from(new Set((articles ?? []).flatMap((a) => a.tags ?? []))).sort();

  function toggleTag(t: string) {
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
      <StudyListRail
        studyLists={studyLists ?? []}
        activeId={studyListId}
        onSelect={setStudyListId}
        onCreate={(name) => createStudyList.mutate(name)}
        onDelete={(id) => {
          deleteStudyList.mutate(id);
          if (studyListId === id) setStudyListId(null);
        }}
      />

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search my articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
          </select>
          <AddArticleDialog />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "DRAFT", "PUBLISHED", "ARCHIVED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  activeTags.includes(t) ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                <TagIcon className="h-3 w-3" /> {t}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {articles?.map((a) => (
            <ArticleCard key={a.id} article={a} studyLists={studyLists ?? []} activeStudyListId={studyListId} />
          ))}
        </div>

        {!isLoading && articles?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No articles match these filters.</p>
        )}
      </div>
    </div>
  );
}

function StudyListRail({
  studyLists, activeId, onSelect, onCreate, onDelete,
}: {
  studyLists: StudyList[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="space-y-1">
      <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Lists</p>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          activeId === null ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"
        )}
      >
        {activeId === null ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
        All Articles
      </button>

      {studyLists.map((list) => (
        <div key={list.id} className="group flex items-center">
          <button
            type="button"
            onClick={() => onSelect(list.id)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              activeId === list.id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"
            )}
          >
            {activeId === list.id ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
            <span className="truncate">{list.name}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{list.articleCount}</span>
          </button>
          <button
            type="button"
            aria-label="Delete study list"
            title="Delete list"
            onClick={() => onDelete(list.id)}
            className="ml-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <Input
            autoFocus
            className="h-7 text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
            }}
            placeholder="List name..."
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={submit}>Add</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60"
        >
          <FolderPlus className="h-4 w-4" /> New list
        </button>
      )}
    </div>
  );
}

const VISIBILITY_CONFIG: Record<string, { label: string; icon: ComponentType<{ className?: string }>; className: string }> = {
  PRIVATE: { label: "Private", icon: Lock, className: "bg-muted text-muted-foreground" },
  UNLISTED: { label: "Unlisted", icon: Link2, className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  PUBLIC: { label: "Public", icon: Globe, className: "bg-primary/10 text-primary" },
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  ARCHIVED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function ArticleCard({
  article, studyLists = [], activeStudyListId = null,
}: { article: Article; studyLists?: StudyList[]; activeStudyListId?: string | null }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteArticle = useDeleteArticle();
  const updatePassage = useUpdatePassage();
  const addToList = useAddArticleToStudyList();
  const removeFromList = useRemoveArticleFromStudyList();

  const vis = VISIBILITY_CONFIG[article.visibility ?? "PRIVATE"] ?? VISIBILITY_CONFIG.PRIVATE;
  const VisIcon = vis.icon;
  const status = article.status ?? "DRAFT";
  const isArchived = status === "ARCHIVED";

  return (
    <>
      <Card className="group relative transition-shadow hover:shadow-md">
        <Link to={`/articles/${article.id}`} className="block">
          <CardContent className="flex items-center gap-3 p-4 pr-11">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <BookText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{article.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", vis.className)}>
                  <VisIcon className="h-3 w-3" /> {vis.label}
                </span>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[status])}>
                  {STATUS_LABELS[status as StatusFilter] ?? status}
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
          {studyLists.length > 0 && (
            <label
              className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Add to study list"
              onClick={(e) => e.stopPropagation()}
            >
              <ListPlus className="h-4 w-4" />
              <select
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value=""
                onChange={(e) => {
                  if (e.target.value) addToList.mutate({ studyListId: e.target.value, articleId: article.id });
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Add to list...</option>
                {studyLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
          {activeStudyListId && (
            <button
              type="button"
              aria-label="Remove from this list"
              title="Remove from this list"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeFromList.mutate({ studyListId: activeStudyListId, articleId: article.id });
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label={isArchived ? "Restore to draft" : "Archive"}
            title={isArchived ? "Restore to draft" : "Archive"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updatePassage.mutate({ id: article.id, status: isArchived ? "DRAFT" : "ARCHIVED" });
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
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
