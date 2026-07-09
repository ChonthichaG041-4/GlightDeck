import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Eye, Star, Users, BookOpen, Search, Tag as TagIcon, Flame, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCommunityPassages, useToggleLike } from "@/api/hooks";
import { cn } from "@/lib/utils";

// ============================================================================
// Community browsing - shared between the Articles hub's "Community" tab and
// (until Phase 2 removes it) Reading's own "Community" tab. Lists every
// PUBLIC article regardless of category (Reading- or Listening-created).
// "Read" opens the shared Article Detail page (/articles/:id), same as My
// Articles cards - rating/reading/listening all happen from there.
//
// Category/Difficulty/Tags filters live ONLY here (not in My Articles) per
// the Articles-hub IA - My Articles uses Study Lists/Tags/status instead.
// ============================================================================

const DIFFICULTIES = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function CommunityTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<"latest" | "popular">("latest");

  const { data: passages, isLoading } = useCommunityPassages({
    search: debouncedSearch || undefined,
    category: category || undefined,
    difficulty: difficulty || undefined,
    tags: activeTags.length ? activeTags : undefined,
    sort,
  });
  const toggleLike = useToggleLike();

  const categories = Array.from(new Set((passages ?? []).map((p) => p.category).filter(Boolean))).sort();
  const allTags = Array.from(new Set((passages ?? []).flatMap((p) => p.tags ?? []))).sort();

  function toggleTag(t: string) {
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search community articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All Difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setSort("latest")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              sort === "latest" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Clock className="h-3.5 w-3.5" /> Latest
          </button>
          <button
            type="button"
            onClick={() => setSort("popular")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              sort === "popular" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Flame className="h-3.5 w-3.5" /> Popular
          </button>
        </div>
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

      {!isLoading && (!passages || passages.length === 0) && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8" />
          <p>ยังไม่มีบทความสาธารณะที่ตรงกับตัวกรองนี้ - ลอง Publish บทความของคุณจากแท็บ "Generate with AI" หรือ "Create" ดูก่อน</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {passages?.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">โดย {p.authorName} · {p.category}</p>
                </div>
                {p.cefrLevel && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs">{p.cefrLevel}</span>}
              </div>
              <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{p.content}</p>
              {p.tags && p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.tags.slice(0, 4).map((t) => (
                    <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[11px]">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{p.stats.views}</span>
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{p.stats.avgRating ?? "-"}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{p.stats.attempts}</span>
                </div>
                <button
                  onClick={() => toggleLike.mutate(p.id)}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <Heart className={cn("h-3.5 w-3.5", p.stats.liked && "fill-red-500 text-red-500")} />
                  {p.stats.likes}
                </button>
              </div>
              <Button asChild size="sm" className="mt-1 w-full gap-1.5">
                <Link to={`/articles/${p.id}`}>
                  <BookOpen className="h-3.5 w-3.5" /> Read
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
