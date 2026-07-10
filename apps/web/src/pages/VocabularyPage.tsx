import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Star,
  Volume2,
  Upload,
  Trash2,
  Sparkles,
  Layers,
  Headphones,
  ListChecks,
  Pencil,
  Folder,
  FolderPlus,
  Wand2,
  X,
  Check,
  MoreHorizontal,
  Book,
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
  Wind,
  Snowflake,
  Thermometer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  useWords,
  useCollections,
  useTags,
  useToggleFavorite,
  useCreateWord,
  useUpdateWord,
  useDeleteWord,
  useImportPaste,
  useWordRelations,
  useWordLookup,
  useSentences,
  useCreateSentence,
  useGenerateWordSet,
  useBulkCreateWords,
  useCreateCollection,
  type GeneratedWordItem,
} from "@/api/hooks";
import { speak } from "@/lib/tts";
import { ManageDialog } from "@/components/layout/ManageDialog";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { Level, Word, WordType } from "@/types";

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES: WordType[] = [
  "NOUN",
  "VERB",
  "ADJECTIVE",
  "ADVERB",
  "IDIOM",
  "SLANG",
  "PHRASE",
];
const STATUSES = ["NEW", "LEARNING", "REVIEW", "MASTERED"];

const statusColor: Record<string, string> = {
  NEW: "secondary",
  LEARNING: "warning",
  REVIEW: "default",
  MASTERED: "success",
};

const LEVEL_BADGE_COLORS: Record<string, string> = {
  A1: "bg-blue-100 text-blue-700",
  A2: "bg-emerald-100 text-emerald-700",
  B1: "bg-violet-100 text-violet-700",
  B2: "bg-orange-100 text-orange-700",
  C1: "bg-pink-100 text-pink-700",
  C2: "bg-red-100 text-red-700",
};

// Word-card icon avatar: a handful of words get a topically-matched icon (mostly useful
// for weather/temperature-style vocabulary sets), everything else gets a colorful icon
// deterministically picked from the headword so every card still looks lively and varied.
const WORD_ICON_RULES: {
  match: RegExp;
  icon: typeof Book;
  bg: string;
  fg: string;
}[] = [
  {
    match: /\b(sun|sunny)\b/i,
    icon: Sun,
    bg: "bg-amber-100",
    fg: "text-amber-600",
  },
  {
    match: /\b(rain|rainy|shower)\b/i,
    icon: CloudRain,
    bg: "bg-sky-100",
    fg: "text-sky-600",
  },
  {
    match: /\b(cloud|cloudy)\b/i,
    icon: Cloud,
    bg: "bg-blue-100",
    fg: "text-blue-500",
  },
  {
    match: /\b(wind|windy)\b/i,
    icon: Wind,
    bg: "bg-teal-100",
    fg: "text-teal-600",
  },
  {
    match: /\b(snow|snowy)\b/i,
    icon: Snowflake,
    bg: "bg-cyan-100",
    fg: "text-cyan-600",
  },
  {
    match: /\b(hot|warm)\b/i,
    icon: Thermometer,
    bg: "bg-red-100",
    fg: "text-red-500",
  },
  {
    match: /\b(cold|cool|chilly)\b/i,
    icon: Thermometer,
    bg: "bg-sky-100",
    fg: "text-sky-600",
  },
  {
    match: /\b(degrees?|celsius|fahrenheit|temperature)\b/i,
    icon: Thermometer,
    bg: "bg-rose-100",
    fg: "text-rose-600",
  },
  {
    match: /\b(weather|storm|climate)\b/i,
    icon: CloudSun,
    bg: "bg-indigo-100",
    fg: "text-indigo-600",
  },
];

const FALLBACK_ICON_PALETTE: { icon: typeof Book; bg: string; fg: string }[] = [
  { icon: Book, bg: "bg-violet-100", fg: "text-violet-600" },
  { icon: Sparkles, bg: "bg-pink-100", fg: "text-pink-600" },
  { icon: Star, bg: "bg-amber-100", fg: "text-amber-600" },
  { icon: Cloud, bg: "bg-blue-100", fg: "text-blue-500" },
  { icon: Book, bg: "bg-emerald-100", fg: "text-emerald-600" },
  { icon: Sparkles, bg: "bg-orange-100", fg: "text-orange-600" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function getWordIcon(headword: string) {
  const rule = WORD_ICON_RULES.find((r) => r.match.test(headword));
  if (rule) return rule;
  return FALLBACK_ICON_PALETTE[
    hashString(headword) % FALLBACK_ICON_PALETTE.length
  ];
}

export default function VocabularyPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [level, setLevel] = useState(params.get("level") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionId, setCollectionId] = useState(
    params.get("collectionId") ?? "ALL",
  );
  const [selected, setSelected] = useState<Word | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );

  // Gallery-mode "jump to word" search: typing a word here (while browsing the
  // Collections gallery) opens the collection that contains it and highlights the card.
  const [gallerySearch, setGallerySearch] = useState("");
  const [highlightWordId, setHighlightWordId] = useState<string | null>(null);

  // "ALL" = collections gallery (click a card to drill into its words).
  // "ALL_WORDS" = flat list of every word, no collection grouping.
  // anything else = a specific collection id, filtering the word grid to just that group.
  const isGallery = collectionId === "ALL";
  const activeCollectionId =
    !isGallery && collectionId !== "ALL_WORDS" ? collectionId : undefined;

  const filters = useMemo(
    () => ({
      search: search || undefined,
      level: level || undefined,
      type: type || undefined,
      status: status || undefined,
      collectionId: activeCollectionId,
      favorite: favoritesOnly ? "true" : undefined,
    }),
    [search, level, type, status, activeCollectionId, favoritesOnly],
  );

  function changeCollection(v: string) {
    setCollectionId(v);
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
    setHighlightWordId(null);
    setParams((p) => {
      if (v === "ALL") p.delete("collectionId");
      else p.set("collectionId", v);
      return p;
    });
  }

  // Plain click toggles just this word; shift-click selects the whole range between
  // the last clicked card and this one (standard file-explorer-style multi-select).
  function handleSelectClick(id: string, index: number, shiftKey: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex !== null && words) {
        const [start, end] =
          lastSelectedIndex < index
            ? [lastSelectedIndex, index]
            : [index, lastSelectedIndex];
        for (let i = start; i <= end; i++) {
          const wid = words[i]?.id;
          if (wid) next.add(wid);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedIndex(index);
  }

  // Gallery search: as the user types a word, jump straight into whichever
  // collection contains it (or "All words" if it has none) and highlight the card.
  function goToWordFromGallerySearch(matches: Word[] | undefined) {
    const term = gallerySearch.trim();
    if (!term || !matches?.length) return;
    const match = matches[0];
    changeCollection(match.collection?.id ?? "ALL_WORDS");
    setHighlightWordId(match.id);
  }

  // Unchecked = practice the whole current group; checked = practice just those words.
  function practiceQuery(): string {
    const p = new URLSearchParams();
    if (selectedIds.size > 0)
      p.set("wordIds", Array.from(selectedIds).join(","));
    else if (activeCollectionId) p.set("collectionId", activeCollectionId);
    return p.toString();
  }

  const { data: words, isLoading } = useWords(filters);
  const { data: collections } = useCollections();
  const { data: tags } = useTags();
  const toggleFavorite = useToggleFavorite();
  const deleteWord = useDeleteWord();
  const updateWord = useUpdateWord();

  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const allSelected =
    !!words?.length && words.every((w) => selectedIds.has(w.id));

  function toggleSelectAll() {
    if (!words?.length) return;
    setSelectedIds(allSelected ? new Set() : new Set(words.map((w) => w.id)));
    setLastSelectedIndex(null);
  }

  // Picking a collection from the dropdown moves the current selection right away -
  // there's no separate confirm button. The trigger label itself doubles as the
  // status: "Move" while idle, "Move to Collection..." while the request is in flight.
  async function moveSelectedToCollection(target: string) {
    if (!target || selectedIds.size === 0) return;
    setMoving(true);
    setMoveError(null);
    const ids = Array.from(selectedIds);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          updateWord.mutateAsync({
            id,
            collectionId: target === "NONE" ? null : target,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        // Log the real cause (e.g. server validation/auth error) so it's easy to diagnose,
        // instead of silently doing nothing like before.
        console.error("Move to collection failed for some words:", failed);
      }
      // Only drop the words that actually moved out of the current selection - if some
      // failed, they stay selected so the user can see + retry just those.
      const succeededIds = ids.filter(
        (_, i) => results[i].status === "fulfilled",
      );
      if (succeededIds.length) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      if (failed.length) {
        setMoveError(
          failed.length === ids.length
            ? "ย้ายคำศัพท์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
            : `ย้ายสำเร็จ ${succeededIds.length}/${ids.length} คำ - ที่เหลือย้ายไม่สำเร็จ กรุณาลองใหม่`,
        );
      } else {
        setLastSelectedIndex(null);
      }
    } finally {
      setMoving(false);
    }
  }

  const gallerySearchTerm = gallerySearch.trim();
  const { data: gallerySearchResults } = useWords(
    gallerySearchTerm ? { search: gallerySearchTerm } : {},
  );

  // Auto-jump a moment after the user stops typing (2+ characters), so it doesn't
  // fire away mid-word - Enter (see the input below) still jumps immediately too.
  useEffect(() => {
    if (!isGallery || gallerySearchTerm.length < 2) return;
    const t = setTimeout(
      () => goToWordFromGallerySearch(gallerySearchResults),
      500,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGallery, gallerySearchTerm, gallerySearchResults]);

  // Fade the "you searched for this" highlight out after a few seconds.
  useEffect(() => {
    if (!highlightWordId) return;
    const t = setTimeout(() => setHighlightWordId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightWordId]);

  // Scroll the highlighted card into view once its collection's words have loaded.
  useEffect(() => {
    if (!highlightWordId) return;
    const el = document.getElementById(`word-${highlightWordId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightWordId, words]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
          <p className="text-sm text-muted-foreground">
            {isGallery
              ? `${collections?.length ?? 0} collections`
              : `${words?.length ?? 0} words in your personal dictionary`}
          </p>
        </div>
        <div className="flex gap-2">
          <ManageDialog />
          <ImportDialog collections={collections} />
          <GenerateSetDialog
            collections={collections}
            onSaved={(cid) => changeCollection(cid ?? "ALL_WORDS")}
          />
          <AddCollectionDialog />
          <AddWordDialog collections={collections} tags={tags} />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {!isGallery && (
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search apple, angry, ancient..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setParams((p) => {
                    p.set("search", e.target.value);
                    return p;
                  });
                }}
              />
            </div>
          )}

          {isGallery && (
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search a word to jump to its collection..."
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    goToWordFromGallerySearch(gallerySearchResults);
                }}
              />
            </div>
          )}

          <CollectionPicker
            value={collectionId}
            onChange={changeCollection}
            className="w-48"
            includeAllWords
          />

          {!isGallery && (
            <>
              <Select
                value={level || "ALL"}
                onValueChange={(v) => setLevel(v === "ALL" ? "" : v)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Levels</SelectItem>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={type || "ALL"}
                onValueChange={(v) => setType(v === "ALL" ? "" : v)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Tag / Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={status || "ALL"}
                onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant={favoritesOnly ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Star
                  className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`}
                />{" "}
                Favorites
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {isGallery ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections?.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => changeCollection(c.id)}
            >
              <CardContent className="flex items-center gap-3 p-5">
                <span className="text-3xl">{c.icon ?? "📚"}</span>
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.wordCount ?? 0} words
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!collections?.length && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No collections yet. Click "Add Collection" above to create your
              first one.
            </p>
          )}
        </div>
      ) : (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={!words?.length}
                  className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      allSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {allSelected && <Check className="h-3 w-3" />}
                  </span>
                  Select All
                </button>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {selectedIds.size > 0
                    ? `Practice ${selectedIds.size} selected word(s)`
                    : "Practice this group"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value=""
                  onValueChange={moveSelectedToCollection}
                  disabled={selectedIds.size === 0 || moving}
                >
                  <SelectTrigger className="w-44 gap-1.5">
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    <SelectValue
                      placeholder={moving ? "Move to Collection..." : "Move"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Collection</SelectItem>
                    {collections?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/flashcards?${practiceQuery()}`}>
                    <Layers className="h-3.5 w-3.5" /> Flashcards
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/listening?${practiceQuery()}`}>
                    <Headphones className="h-3.5 w-3.5" /> Listening
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/quiz?${practiceQuery()}`}>
                    <ListChecks className="h-3.5 w-3.5" /> Quiz
                  </Link>
                </Button>
              </div>
              {moveError && (
                <p className="w-full text-xs font-medium text-destructive">
                  {moveError}
                </p>
              )}
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {words?.map((w, i) => {
                const wordIcon = getWordIcon(w.headword);
                const WordIcon = wordIcon.icon;
                const isSelected = selectedIds.has(w.id);
                return (
                  <Card
                    key={w.id}
                    id={`word-${w.id}`}
                    className={`cursor-pointer transition-shadow hover:shadow-md ${
                      isSelected
                        ? "border-primary ring-2 ring-primary bg-primary/5"
                        : highlightWordId === w.id
                          ? "border-amber-400 ring-2 ring-amber-400"
                          : ""
                    }`}
                    onClick={() => setSelected(w)}
                  >
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectClick(w.id, i, e.shiftKey);
                            }}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40"
                            }`}
                            title="Select for practice (shift-click to select a range)"
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${wordIcon.bg}`}
                          >
                            <WordIcon className={`h-5 w-5 ${wordIcon.fg}`} />
                          </div>
                          <div>
                            <p className="font-semibold">{w.headword}</p>
                            <p className="text-xs text-muted-foreground">
                              {w.ipa}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusColor[w.status] as any}>
                            {w.status}
                          </Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite.mutate(w.id);
                            }}
                          >
                            <Star
                              className={`h-4 w-4 ${w.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                            />
                          </button>
                        </div>
                      </div>
                      <p className="mb-3 text-sm">{w.meaning}</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_BADGE_COLORS[w.level] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {w.level}
                          </span>
                          {w.collection && (
                            <Badge variant="secondary" className="gap-1">
                              <span>
                                {w.collection.icon ?? (
                                  <Folder className="h-3 w-3" />
                                )}
                              </span>{" "}
                              {w.collection.name}
                            </Badge>
                          )}
                          {w.tags.slice(0, 2).map((t) => (
                            <Badge key={t.id} variant="secondary">
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              speak(w.headword);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Pronounce"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                          <button
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteWord.mutate(w.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(w);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="More options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button> */}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {words?.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  No words found. Try adjusting filters or add your first word.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <WordDetailDialog
        word={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        collections={collections}
      />
    </div>
  );
}

const EDIT_TYPES = [
  "NOUN",
  "VERB",
  "ADJECTIVE",
  "ADVERB",
  "IDIOM",
  "SLANG",
  "PHRASE",
  "PREPOSITION",
  "CONJUNCTION",
  "PRONOUN",
  "OTHER",
];

function WordDetailDialog({
  word,
  open,
  onOpenChange,
  collections,
}: {
  word: Word | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collections?: any[];
}) {
  const deleteWord = useDeleteWord();
  const updateWord = useUpdateWord();
  const { data: sentences } = useSentences();
  const createSentence = useCreateSentence();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [newSentence, setNewSentence] = useState("");
  const [newSentenceTranslate, setNewSentenceTranslate] = useState("");

  useEffect(() => {
    if (word) {
      setForm({
        meaning: word.meaning,
        ipa: word.ipa ?? "",
        type: word.type,
        level: word.level,
        example: word.example ?? "",
        exampleTranslate: word.exampleTranslate ?? "",
        synonym: word.synonym ?? "",
        opposite: word.opposite ?? "",
        frequency: word.frequency,
        collectionId: word.collection?.id ?? "",
      });
    }
    setEditing(false);
  }, [word?.id]);

  if (!word || !form) return null;

  const wordSentences = sentences?.filter((s) => s.word?.id === word.id) ?? [];

  function save() {
    if (!word) return;
    updateWord.mutate(
      { id: word.id, ...form, collectionId: form.collectionId || undefined },
      { onSuccess: () => setEditing(false) },
    );
  }

  function addSentence() {
    if (!word || !newSentence.trim()) return;
    createSentence.mutate(
      {
        text: newSentence.trim(),
        translation: newSentenceTranslate.trim() || undefined,
        wordId: word.id,
      },
      {
        onSuccess: () => {
          setNewSentence("");
          setNewSentenceTranslate("");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              {word.image} {word.headword}
              <button onClick={() => speak(word.headword)}>
                <Volume2 className="h-5 w-5 text-muted-foreground hover:text-primary" />
              </button>
            </DialogTitle>
            <div className="flex items-center gap-3">
              <button
                title="Edit"
                onClick={() => setEditing((e) => !e)}
                className={
                  editing
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                }
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                className="text-destructive"
                onClick={() => {
                  deleteWord.mutate(word.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3 text-sm">
            <div>
              <Label>Meaning</Label>
              <Input
                value={form.meaning}
                onChange={(e) => setForm({ ...form, meaning: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>IPA</Label>
                <Input
                  value={form.ipa}
                  onChange={(e) => setForm({ ...form, ipa: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => setForm({ ...form, level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Example</Label>
              <Input
                value={form.example}
                onChange={(e) => setForm({ ...form, example: e.target.value })}
              />
            </div>
            <div>
              <Label>Translate</Label>
              <Input
                value={form.exampleTranslate}
                onChange={(e) =>
                  setForm({ ...form, exampleTranslate: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Synonym</Label>
                <Input
                  value={form.synonym}
                  onChange={(e) =>
                    setForm({ ...form, synonym: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Opposite</Label>
                <Input
                  value={form.opposite}
                  onChange={(e) =>
                    setForm({ ...form, opposite: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Collection</Label>
                <Select
                  value={form.collectionId || "NONE"}
                  onValueChange={(v) =>
                    setForm({ ...form, collectionId: v === "NONE" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {collections?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select
                  value={String(form.frequency)}
                  onValueChange={(v) =>
                    setForm({ ...form, frequency: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {"★".repeat(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={save}
                disabled={updateWord.isPending}
              >
                {updateWord.isPending ? "Saving..." : "Save changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <Field label="Meaning" value={word.meaning} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="IPA" value={word.ipa || "-"} />
              <Field label="Type" value={word.type} />
              <Field label="Level" value={word.level} />
            </div>
            <Field label="Example" value={word.example || "-"} />
            <Field label="Translate" value={word.exampleTranslate || "-"} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Synonym" value={word.synonym || "-"} />
              <Field label="Opposite" value={word.opposite || "-"} />
            </div>
            <Field label="Collection" value={word.collection?.name ?? "-"} />
            <div>
              <p className="mb-1 font-medium text-muted-foreground">
                Frequency
              </p>
              <p>
                {"★".repeat(word.frequency)}
                {"☆".repeat(5 - word.frequency)}
              </p>
            </div>
            <WordMindmap wordId={word.id} />
          </div>
        )}

        <div className="mt-2 space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Example sentences
          </p>
          {wordSentences.map((s) => (
            <div key={s.id} className="rounded-md bg-muted p-2 text-sm">
              <p>"{s.text}"</p>
              {s.translation && (
                <p className="text-xs text-muted-foreground">{s.translation}</p>
              )}
            </div>
          ))}
          <Input
            placeholder="Add another example sentence..."
            value={newSentence}
            onChange={(e) => setNewSentence(e.target.value)}
          />
          <Input
            placeholder="Translation (optional)"
            value={newSentenceTranslate}
            onChange={(e) => setNewSentenceTranslate(e.target.value)}
          />
          <Button
            size="sm"
            className="gap-1.5"
            onClick={addSentence}
            disabled={createSentence.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> Add example
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WordMindmap({ wordId }: { wordId: string }) {
  const { data } = useWordRelations(wordId);
  if (!data?.related?.length) return null;
  return (
    <div>
      <p className="mb-2 font-medium text-muted-foreground">
        Word Relationship
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground">
          {data.headword}
        </span>
        {data.related.map((r: any, i: number) => (
          <span key={r.id} className="flex items-center gap-2">
            <span className="text-muted-foreground">→</span>
            <span className="rounded-full bg-accent px-3 py-1 text-accent-foreground">
              {r.headword}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function AddWordDialog({
  collections,
  tags,
}: {
  collections?: any[];
  tags?: any[];
}) {
  const [open, setOpen] = useState(false);
  const createWord = useCreateWord();
  const lookup = useWordLookup();

  const [sourceLang, setSourceLang] = useState("en");
  const [targetLangs, setTargetLangs] = useState<string[]>(["th"]);
  const [form, setForm] = useState({
    headword: "",
    ipa: "",
    example: "",
    exampleTranslate: "",
    level: "A1",
    type: "NOUN",
    collectionId: "",
  });
  const [translations, setTranslations] = useState<Record<string, string>>({
    th: "",
  });
  const [error, setError] = useState<string | null>(null);

  function toggleTargetLang(code: string) {
    setTargetLangs((prev) => {
      const next = prev.includes(code)
        ? prev.filter((l) => l !== code)
        : [...prev, code];
      return next.length ? next : prev; // always keep >= 1 target language
    });
  }

  function runAutoSuggest() {
    if (!form.headword.trim()) return;
    lookup.mutate(
      { headword: form.headword.trim(), sourceLang, targetLangs },
      {
        onSuccess: (data) => {
          setForm((f) => ({
            ...f,
            ipa: data.ipa ?? f.ipa,
            type: data.type ?? f.type,
            level: data.level ?? f.level,
            example: data.example ?? f.example,
          }));
          setTranslations((prev) => ({ ...prev, ...data.translations }));
        },
      },
    );
  }

  function reset() {
    setForm({
      headword: "",
      ipa: "",
      example: "",
      exampleTranslate: "",
      level: "A1",
      type: "NOUN",
      collectionId: "",
    });
    setTranslations({ th: "" });
    setTargetLangs(["th"]);
    setSourceLang("en");
    setError(null);
  }

  function submit() {
    setError(null);

    if (!form.headword.trim()) {
      setError("Enter the word first.");
      return;
    }

    const missingLangs = targetLangs.filter(
      (code) => !translations[code]?.trim(),
    );
    if (missingLangs.length) {
      setError(
        `Fill in the meaning for: ${missingLangs.map(languageLabel).join(", ")} (or run Auto-suggest).`,
      );
      return;
    }

    const primaryMeaning = translations[targetLangs[0]].trim();
    createWord.mutate(
      {
        ...form,
        sourceLang,
        meaning: primaryMeaning,
        translations,
        collectionId: form.collectionId || undefined,
        level: form.level as Level,
        type: form.type as WordType,
        frequency: 3,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
        onError: (err: any) =>
          setError(
            err?.response?.data?.error ??
              "Could not save this word. Please try again.",
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add Word
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a new word</DialogTitle>
          <DialogDescription>
            Choose languages, type the word, and let auto-suggest fill in the
            rest.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Source language</Label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Collection</Label>
              <Select
                value={form.collectionId || "NONE"}
                onValueChange={(v) =>
                  setForm({ ...form, collectionId: v === "NONE" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {collections?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              Translate into (choose one or more)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.filter((l) => l.code !== sourceLang).map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => toggleTargetLang(l.code)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    targetLangs.includes(l.code)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Word ({languageLabel(sourceLang)})</Label>
              <Input
                value={form.headword}
                onChange={(e) => setForm({ ...form, headword: e.target.value })}
                placeholder="apple"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={runAutoSuggest}
                disabled={lookup.isPending || !form.headword.trim()}
              >
                <Sparkles className="h-4 w-4" />{" "}
                {lookup.isPending ? "..." : "Auto-suggest"}
              </Button>
            </div>
          </div>

          {lookup.data?.source === "free" && (
            <p className="text-xs text-muted-foreground">
              Filled in using free dictionary + translation APIs (no API key
              needed). Level isn't auto-detected this way - set it manually, or
              add <code>ANTHROPIC_API_KEY</code> on the server for smarter, more
              accurate suggestions.
            </p>
          )}
          {lookup.data?.source === "offline" && (
            <p className="text-xs text-muted-foreground">
              Auto-suggest couldn't reach any lookup service right now (check
              your internet connection). Fill the fields in manually below.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>IPA</Label>
              <Input
                value={form.ipa}
                onChange={(e) => setForm({ ...form, ipa: e.target.value })}
                placeholder="/ˈæpəl/"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "NOUN",
                    "VERB",
                    "ADJECTIVE",
                    "ADVERB",
                    "IDIOM",
                    "SLANG",
                    "PHRASE",
                    "PREPOSITION",
                    "CONJUNCTION",
                    "PRONOUN",
                    "OTHER",
                  ].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm({ ...form, level: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Meaning - editable per language
            </p>
            {targetLangs.map((code) => (
              <div key={code}>
                <Label className="text-xs">{languageLabel(code)}</Label>
                <Input
                  value={translations[code] ?? ""}
                  onChange={(e) =>
                    setTranslations((prev) => ({
                      ...prev,
                      [code]: e.target.value,
                    }))
                  }
                  placeholder={`Meaning in ${languageLabel(code)}`}
                />
              </div>
            ))}
          </div>

          <div>
            <Label>Example sentence</Label>
            <Input
              value={form.example}
              onChange={(e) => setForm({ ...form, example: e.target.value })}
            />
          </div>
          <div>
            <Label>Example translation</Label>
            <Input
              value={form.exampleTranslate}
              onChange={(e) =>
                setForm({ ...form, exampleTranslate: e.target.value })
              }
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={submit}
            disabled={createWord.isPending}
          >
            {createWord.isPending ? "Saving..." : "Save word"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COLLECTION_ICON_PRESETS = [
  "📚",
  "📖",
  "✈️",
  "💼",
  "🍜",
  "🎮",
  "🎬",
  "🌦️",
  "💬",
  "📝",
  "🏋️",
  "🎵",
];

function AddCollectionDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📚");
  const [error, setError] = useState<string | null>(null);
  const createCollection = useCreateCollection();

  function reset() {
    setName("");
    setIcon("📚");
    setError(null);
  }

  function submit() {
    if (!name.trim()) {
      setError("Enter a name for the collection.");
      return;
    }
    setError(null);
    createCollection.mutate(
      { name: name.trim(), icon: icon.trim() || "📚" },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
        onError: (err: any) =>
          setError(
            err?.response?.data?.error ??
              "Could not create this collection. Please try again.",
          ),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FolderPlus className="h-4 w-4" /> Add Collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new collection</DialogTitle>
          <DialogDescription>
            Group your vocabulary by topic, e.g. "Weather", "Travel",
            "Business".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Weather", "Fantasy", "Business"'
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLLECTION_ICON_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors ${
                    icon === emoji
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent"
                  }`}
                >
                  {emoji}
                </button>
              ))}
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-16 text-center text-lg"
                maxLength={4}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={submit}
            disabled={createCollection.isPending}
          >
            {createCollection.isPending ? "Creating..." : "Create collection"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ collections }: { collections?: any[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("apple\norange\nbanana\ngrape");
  const [collectionId, setCollectionId] = useState("");
  const importPaste = useImportPaste();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import vocabulary</DialogTitle>
          <DialogDescription>
            Paste one word per line (CSV / TXT / Excel export also supported via
            the API).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Collection</Label>
          <Select
            value={collectionId || "NONE"}
            onValueChange={(v) => setCollectionId(v === "NONE" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">None</SelectItem>
              {collections?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <textarea
            className="h-32 w-full rounded-md border p-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={() =>
              importPaste.mutate(
                { text, collectionId: collectionId || undefined },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Import & auto-generate cards
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const GENERATE_TYPES = [
  "NOUN",
  "VERB",
  "ADJECTIVE",
  "ADVERB",
  "IDIOM",
  "SLANG",
  "PHRASE",
  "PREPOSITION",
  "CONJUNCTION",
  "PRONOUN",
  "OTHER",
];

function GenerateSetDialog({
  collections,
  onSaved,
}: {
  collections?: any[];
  onSaved?: (collectionId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"setup" | "review">("setup");

  const [sourceLang, setSourceLang] = useState("en");
  const [targetLangs, setTargetLangs] = useState<string[]>(["th"]);
  const [topic, setTopic] = useState("");
  const [cefrLevel, setCefrLevel] = useState("MIXED");
  const [style, setStyle] = useState("TEXTBOOK");
  const [scope, setScope] = useState("STANDARD");
  const [count, setCount] = useState(20);
  const [items, setItems] = useState<GeneratedWordItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const [collectionChoice, setCollectionChoice] = useState("NONE"); // "NONE" | "NEW" | <collection id>
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const generate = useGenerateWordSet();
  const bulkCreate = useBulkCreateWords();

  function toggleTargetLang(code: string) {
    setTargetLangs((prev) => {
      const next = prev.includes(code)
        ? prev.filter((l) => l !== code)
        : [...prev, code];
      return next.length ? next : prev; // always keep >= 1 target language
    });
  }

  function resetAll() {
    setStep("setup");
    setTopic("");
    setCefrLevel("MIXED");
    setStyle("TEXTBOOK");
    setScope("STANDARD");
    setCount(20);
    setItems([]);
    setNote(null);
    setCollectionChoice("NONE");
    setNewCollectionName("");
    setError(null);
  }

  function runGenerate() {
    if (!topic.trim()) {
      setError("กรอกชุดคำศัพท์ที่คุณต้องการก่อน");
      return;
    }
    setError(null);
    generate.mutate(
      {
        topic: topic.trim(),
        sourceLang,
        targetLangs,
        cefrLevel,
        style,
        scope,
        count,
      },
      {
        onSuccess: (data) => {
          setNote(data.note ?? null);
          if (!data.words?.length) {
            setError(
              data.note ??
                "ไม่พบคำศัพท์ที่เกี่ยวข้องกับหัวข้อนี้ ลองหัวข้ออื่น",
            );
            return;
          }
          setItems(
            data.words.map((w) => ({
              headword: w.headword,
              ipa: w.ipa ?? "",
              type: w.type ?? "OTHER",
              level: w.level ?? "A1",
              example: w.example ?? "",
              translations: w.translations ?? {},
            })),
          );
          setStep("review");
        },
        onError: () => setError("สร้างชุดคำศัพท์ไม่สำเร็จ ลองใหม่อีกครั้ง"),
      },
    );
  }

  function updateItem(index: number, patch: Partial<GeneratedWordItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }

  function updateTranslation(index: number, lang: string, value: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, translations: { ...it.translations, [lang]: value } }
          : it,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmSave() {
    setError(null);
    if (!items.length) {
      setError("ไม่มีคำศัพท์ให้บันทึกแล้ว");
      return;
    }
    if (collectionChoice === "NEW" && !newCollectionName.trim()) {
      setError("กรอกชื่อ Collection ใหม่ก่อน");
      return;
    }

    bulkCreate.mutate(
      {
        sourceLang,
        collectionId:
          collectionChoice !== "NONE" && collectionChoice !== "NEW"
            ? collectionChoice
            : undefined,
        newCollectionName:
          collectionChoice === "NEW" ? newCollectionName.trim() : undefined,
        words: items.map((it) => ({
          headword: it.headword,
          ipa: it.ipa || undefined,
          type: it.type,
          level: it.level || "A1",
          example: it.example || undefined,
          translations: it.translations,
        })),
      },
      {
        onSuccess: (data) => {
          // Words are only visible in the Vocabulary page's default "Collections" gallery
          // view if they belong to a collection - jump straight to where they actually
          // landed (the new/existing collection, or the flat "All Words" list if none
          // was chosen) so saving doesn't look like it silently did nothing.
          onSaved?.(data.collectionId ?? null);
          setOpen(false);
          resetAll();
        },
        onError: (err: any) =>
          setError(
            err?.response?.data?.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
          ),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Wand2 className="h-4 w-4" /> AI สร้างชุดคำศัพท์
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>สร้างชุดคำศัพท์ด้วย AI</DialogTitle>
          <DialogDescription>
            {step === "setup"
              ? 'เลือกภาษาต้นทาง-ภาษาแปล แล้วกรอกชุดคำศัพท์ที่คุณต้องการ เช่น "สภาพอากาศ"'
              : "ตรวจสอบ แก้ไข หรือลบรายการที่ไม่ต้องการ ก่อนกดยืนยันบันทึก"}
          </DialogDescription>
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-4">
            <div>
              <Label>ภาษาต้นทาง</Label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">
                แปลเป็นภาษา (เลือกได้มากกว่า 1)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.filter((l) => l.code !== sourceLang).map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => toggleTargetLang(l.code)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      targetLangs.includes(l.code)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>กรอกชุดคำศัพท์ที่คุณต้องการ</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder='เช่น "สภาพอากาศ", "ผลไม้", "การเดินทาง"...'
                onKeyDown={(e) => {
                  if (e.key === "Enter") runGenerate();
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>ระดับ CEFR</Label>
                <Select value={cefrLevel} onValueChange={setCefrLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                    <SelectItem value="MIXED">ผสม (Mixed)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>จำนวนคำ</Label>
                <Select
                  value={String(count)}
                  onValueChange={(v) => setCount(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} คำ
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>รูปแบบคำศัพท์</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXTBOOK">
                      ตำราเรียน (Textbook)
                    </SelectItem>
                    <SelectItem value="CONVERSATION">
                      บทสนทนา (Conversation)
                    </SelectItem>
                    <SelectItem value="TRAVEL">การเดินทาง (Travel)</SelectItem>
                    <SelectItem value="BUSINESS">ธุรกิจ (Business)</SelectItem>
                    <SelectItem value="ACADEMIC">วิชาการ (Academic)</SelectItem>
                    <SelectItem value="IELTS">IELTS</SelectItem>
                    <SelectItem value="TOEIC">TOEIC</SelectItem>
                    <SelectItem value="KIDS">เด็ก (Kids)</SelectItem>
                    <SelectItem value="RANDOM">สุ่ม (Random)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ขอบเขตคำศัพท์</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">พื้นฐาน (Basic)</SelectItem>
                    <SelectItem value="STANDARD">มาตรฐาน (Standard)</SelectItem>
                    <SelectItem value="COMPLETE">ครบถ้วน (Complete)</SelectItem>
                    <SelectItem value="NATIVE">เจ้าของภาษา (Native)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button
              className="w-full gap-2"
              onClick={runGenerate}
              disabled={generate.isPending || !topic.trim()}
            >
              <Wand2 className="h-4 w-4" />{" "}
              {generate.isPending ? "กำลังสร้าง..." : "สร้างชุดคำศัพท์"}
            </Button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {note && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {note}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              พบ {items.length} คำ — แก้ไขหรือกดลบรายการที่ไม่ต้องการ:
            </p>

            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-2">
              {items.map((it, i) => (
                <div key={i} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        value={it.headword}
                        onChange={(e) =>
                          updateItem(i, { headword: e.target.value })
                        }
                        placeholder="Word"
                      />
                      <Input
                        value={it.ipa ?? ""}
                        onChange={(e) => updateItem(i, { ipa: e.target.value })}
                        placeholder="IPA"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select
                      value={it.type}
                      onValueChange={(v) => updateItem(i, { type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GENERATE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.charAt(0) + t.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={it.level ?? "A1"}
                      onValueChange={(v) => updateItem(i, { level: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {targetLangs.map((code) => (
                      <div key={code}>
                        <Label className="text-xs">{languageLabel(code)}</Label>
                        <Input
                          value={it.translations?.[code] ?? ""}
                          onChange={(e) =>
                            updateTranslation(i, code, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!items.length && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  ไม่เหลือคำศัพท์แล้ว
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Label>บันทึกลง Collection</Label>
              <Select
                value={collectionChoice}
                onValueChange={setCollectionChoice}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือก Collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">ไม่ระบุ Collection</SelectItem>
                  {collections?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="NEW">+ สร้าง Collection ใหม่</SelectItem>
                </SelectContent>
              </Select>
              {collectionChoice === "NEW" && (
                <Input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder='ชื่อ Collection ใหม่ เช่น "สภาพอากาศ"'
                />
              )}
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("setup")}
              >
                ← กลับไปแก้หัวข้อ
              </Button>
              <Button
                className="flex-1"
                onClick={confirmSave}
                disabled={bulkCreate.isPending || !items.length}
              >
                {bulkCreate.isPending
                  ? "กำลังบันทึก..."
                  : `ยืนยันสร้าง ${items.length} คำ`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
