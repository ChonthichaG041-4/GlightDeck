import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus, BookText, Trash2, Pencil, Headphones, Search,
  Tag as TagIcon, ListPlus, X, FolderPlus, Folder, FolderOpen,
  Bookmark, MoreVertical, SlidersHorizontal, ChevronLeft, ChevronRight,
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
const PAGE_SIZE_OPTIONS = [6, 12, 24];

export function ArticleLibrary({ onRequestAdd }: { onRequestAdd?: () => void } = {}) {
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  const { data: studyLists } = useStudyLists();
  const createStudyList = useCreateStudyList();
  const deleteStudyList = useDeleteStudyList();

  // Unfiltered count, purely so "All Articles" in the rail can show a true
  // total instead of whatever the active filters happen to leave visible.
  const { data: allMyArticles } = useArticles({});

  const { data: articles, isLoading } = useArticles({
    search: debouncedSearch || undefined,
    tags: activeTags.length ? activeTags : undefined,
    studyListId: studyListId ?? undefined,
    status: status === "ALL" ? undefined : status,
    sort,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, studyListId, activeTags, sort, pageSize]);

  const allTags = Array.from(new Set((articles ?? []).flatMap((a) => a.tags ?? []))).sort();

  function toggleTag(t: string) {
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const total = articles?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = (articles ?? []).slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
      <StudyListRail
        studyLists={studyLists ?? []}
        allArticlesCount={allMyArticles?.length ?? 0}
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
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
              filtersOpen || activeTags.length > 0 ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
            {activeTags.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeTags.length}
              </span>
            )}
          </button>
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

        {filtersOpen && (
          <div className="rounded-lg border bg-muted/30 p-3">
            {allTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                      activeTags.includes(t) ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-accent"
                    )}
                  >
                    <TagIcon className="h-3 w-3" /> {t}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No tags yet - tag an article while editing it to filter by tag here.</p>
            )}
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pageItems.map((a) => (
            <ArticleCard key={a.id} article={a} studyLists={studyLists ?? []} activeStudyListId={studyListId} />
          ))}
          <AddArticleGhostCard onClick={onRequestAdd} />
        </div>

        {!isLoading && total === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No articles match these filters.</p>
        )}

        {total > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors",
                    n === page ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function StudyListRail({
  studyLists, allArticlesCount, activeId, onSelect, onCreate, onDelete,
}: {
  studyLists: StudyList[];
  allArticlesCount: number;
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
    <div className="space-y-1 rounded-xl border bg-card p-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Lists</p>
        <button
          type="button"
          aria-label="New study list"
          title="New study list"
          onClick={() => setAdding(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          activeId === null ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"
        )}
      >
        {activeId === null ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
        <span>All Articles</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{allArticlesCount}</span>
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

      {adding && (
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
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
      >
        <FolderPlus className="h-3.5 w-3.5" /> New Study List
      </button>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  ARCHIVED: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-amber-500",
  PUBLISHED: "bg-emerald-500",
  ARCHIVED: "bg-slate-400",
};

export function ArticleCard({
  article, studyLists = [], activeStudyListId = null,
}: { article: Article; studyLists?: StudyList[]; activeStudyListId?: string | null }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const deleteArticle = useDeleteArticle();
  const updatePassage = useUpdatePassage();
  const addToList = useAddArticleToStudyList();
  const removeFromList = useRemoveArticleFromStudyList();

  const status = article.status ?? "DRAFT";
  const inAnyList = (article.studyListIds?.length ?? 0) > 0;

  return (
    <>
      <Card className="group relative transition-shadow hover:shadow-md">
        <Link to={`/articles/${article.id}`} className="block">
          <CardContent className="flex items-start gap-3 p-4 pb-9 pr-16">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <BookText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{article.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[status])}>
                  {STATUS_LABELS[status as StatusFilter] ?? status}
                </span>
                <span className="text-xs text-muted-foreground">· {new Date(article.createdAt).toLocaleDateString()}</span>
              </div>
              {article.excerpt && (
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{article.excerpt}</p>
              )}
            </div>
          </CardContent>
        </Link>

        {/* Always-visible glance info (not hover-gated - status/save state
            shouldn't require a mouse to discover). */}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} title={STATUS_LABELS[status as StatusFilter] ?? status} />
          {studyLists.length > 0 && (
            <label
              className="relative rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={inAnyList ? "In a study list - click to add to another" : "Add to a study list"}
              onClick={(e) => e.stopPropagation()}
            >
              <Bookmark className="h-4 w-4" fill={inAnyList ? "currentColor" : "none"} />
              <select
                aria-label="Add to study list"
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
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
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
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); }} />
                <div
                  className="absolute bottom-full right-0 z-20 mb-1 w-44 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                  {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { updatePassage.mutate({ id: article.id, status: s }); setMenuOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent",
                        status === s && "font-semibold text-primary"
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                  {activeStudyListId && (
                    <>
                      <div className="my-1 border-t" />
                      <button
                        type="button"
                        onClick={() => { removeFromList.mutate({ studyListId: activeStudyListId, articleId: article.id }); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
                      >
                        <X className="h-3.5 w-3.5" /> Remove from this list
                      </button>
                    </>
                  )}
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
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

function AddArticleGhostCard({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold text-primary">Add New Article</span>
      <span className="max-w-[220px] text-xs text-muted-foreground">Create a new reading or listening practice for your learners.</span>
    </button>
  );
}

export function AddArticleDialog({ open, onOpenChange, trigger }: { open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: boolean }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setDialogOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const createArticle = useCreateArticle();
  const [form, setForm] = useState({ title: "", category: "News", content: "" });

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && (
        <DialogTrigger asChild>
          <Button className="gap-2"><Plus className="h-4 w-4" /> Add Article</Button>
        </DialogTrigger>
      )}
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
            onClick={() => createArticle.mutate(form, { onSuccess: () => { setDialogOpen(false); setForm({ title: "", category: "News", content: "" }); } })}
          >
            Save article
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
