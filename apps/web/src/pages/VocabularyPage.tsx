import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Search, Star, Volume2, Upload, Trash2, Sparkles, Layers, Headphones, ListChecks, Pencil, Folder, FolderPlus,
  Wand2, X, Check, MoreHorizontal, Book, Sun, Cloud, CloudRain, CloudSun, Wind, Snowflake, Thermometer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  useWords, useCollections, useTags, useToggleFavorite, useCreateWord, useUpdateWord, useDeleteWord, useImportPaste,
  useWordRelations, useWordLookup, useSentences, useCreateSentence, useGenerateWordSet, useBulkCreateWords,
  useCreateCollection, type GeneratedWordItem,
} from "@/api/hooks";
import { speak } from "@/lib/tts";
import { ManageDialog } from "@/components/layout/ManageDialog";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { Level, Word, WordType } from "@/types";

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES: WordType[] = ["NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG", "PHRASE"];
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
const WORD_ICON_RULES: { match: RegExp; icon: typeof Book; bg: string; fg: string }[] = [
  { match: /\b(sun|sunny)\b/i, icon: Sun, bg: "bg-amber-100", fg: "text-amber-600" },
  { match: /\b(rain|rainy|shower)\b/i, icon: CloudRain, bg: "bg-sky-100", fg: "text-sky-600" },
  { match: /\b(cloud|cloudy)\b/i, icon: Cloud, bg: "bg-blue-100", fg: "text-blue-500" },
  { match: /\b(wind|windy)\b/i, icon: Wind, bg: "bg-teal-100", fg: "text-teal-600" },
  { match: /\b(snow|snowy)\b/i, icon: Snowflake, bg: "bg-cyan-100", fg: "text-cyan-600" },
  { match: /\b(hot|warm)\b/i, icon: Thermometer, bg: "bg-red-100", fg: "text-red-500" },
  { match: /\b(cold|cool|chilly)\b/i, icon: Thermometer, bg: "bg-sky-100", fg: "text-sky-600" },
  { match: /\b(degrees?|celsius|fahrenheit|temperature)\b/i, icon: Thermometer, bg: "bg-rose-100", fg: "text-rose-600" },
  { match: /\b(weather|storm|climate)\b/i, icon: CloudSun, bg: "bg-indigo-100", fg: "text-indigo-600" },
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
  return FALLBACK_ICON_PALETTE[hashString(headword) % FALLBACK_ICON_PALETTE.length];
}

export default function VocabularyPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [level, setLevel] = useState(params.get("level") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionId, setCollectionId] = useState(params.get("collectionId") ?? "ALL");
  const [selected, setSelected] = useState<Word | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Gallery-mode "jump to word" search: typing a word here (while browsing the
  // Collections gallery) opens the collection that contains it and highlights the card.
  const [gallerySearch, setGallerySearch] = useState("");
  const [highlightWordId, setHighlightWordId] = useState<string | null>(null);

  // "ALL" = collections gallery (click a card to drill into its words).
  // "ALL_WORDS" = flat list of every word, no collection grouping.
  // anything else = a specific collection id, filtering the word grid to just that group.
  const isGallery = collectionId === "ALL";
  const activeCollectionId = !isGallery && collectionId !== "ALL_WORDS" ? collectionId : undefined;

  const filters = useMemo(
    () => ({
      search: search || undefined,
      level: level || undefined,
      type: type || undefined,
      status: status || undefined,
      collectionId: activeCollectionId,
      favorite: favoritesOnly ? "true" : undefined,
    }),
    [search, level, type, status, activeCollectionId, favoritesOnly]
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
        const [start, end] = lastSelectedIndex < index ? [lastSelectedIndex, index] : [index, lastSelectedIndex];
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
    if (selectedIds.size > 0) p.set("wordIds", Array.from(selectedIds).join(","));
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

  const allSelected = !!words?.length && words.every((w) => selectedIds.has(w.id));

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
          updateWord.mutateAsync({ id, collectionId: target === "NONE" ? null : target })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        // Log the real cause (e.g. server validation/auth error) so it's easy to diagnose,
        // instead of silently doing nothing like before.
        console.error("Move to collection failed for some words:", failed);
      }
      // Only drop the words that actually moved out of the current selection - if some
      // failed, they stay selected so the user can see + retry just those.
      const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled");
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
            : `ย้ายสำเร็จ ${succeededIds.length}/${ids.length} คำ - ที่เหลือย้ายไม่สำเร็จ กรุณาลองใหม่`
        );
      } else {
        setLastSelectedIndex(null);
      }
    } finally {
      setMoving(false);
    }
  }

  const gallerySearchTerm = gallerySearch.trim();
  const { data: gallerySearchResults } = useWords(gallerySearchTerm ? { search: gallerySearchTerm } : {});

  // Auto-jump a moment after the user stops typing (2+ characters), so it doesn't
  // fire away mid-word - Enter (see the input below) still jumps immediately too.
  useEffect(() => {
    if (!isGallery || gallerySearchTerm.length < 2) return;
    const t = setTimeout(() => goToWordFromGallerySearch(gallerySearchResults), 500);
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
          <GenerateSetDialog collections={collections} onSaved={(cid) => changeCollection(cid ?? "ALL_WORDS")} />
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
                onKeyDown={(e) => { if (e.key === "Enter") goToWordFromGallerySearch(gallerySearchResults); }}
              />
            </div>
          )}

          <CollectionPicker value={collectionId} onChange={changeCollection} className="w-48" includeAllWords />

          {!isGallery && (
            <>
              <Select value={level || "ALL"} onValueChange={(v) => setLevel(v === "ALL" ? "" : v)}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Levels</SelectItem>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={type || "ALL"} onValueChange={(v) => setType(v === "ALL" ? "" : v)}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Tag / Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant={favoritesOnly ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Star className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} /> Favorites
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
                  <p className="text-xs text-muted-foreground">{c.wordCount ?? 0} words</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!collections?.length && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No collections yet. Click "Add Collection" above to create your first one.
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
                      allSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                    }`}
                  >
                    {allSelected && <Check className="h-3 w-3" />}
                  </span>
                  Select All
                </button>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {selectedIds.size > 0 ? `Practice ${selectedIds.size} selected word(s)` : "Practice this group"}
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
                    <SelectValue placeholder={moving ? "Move to Collection..." : "Move"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Collection</SelectItem>
                    {collections?.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/flashcards?${practiceQuery()}`}><Layers className="h-3.5 w-3.5" /> Flashcards</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/listening?${practiceQuery()}`}><Headphones className="h-3.5 w-3.5" /> Listening</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to={`/quiz?${practiceQuery()}`}><ListChecks className="h-3.5 w-3.5" /> Quiz</Link>
                </Button>
              </div>
              {moveError && (
                <p className="w-full text-xs font-medium text-destructive">{moveError}</p>
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
                              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                            }`}
                            title="Select for practice (shift-click to select a range)"
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${wordIcon.bg}`}>
                            <WordIcon className={`h-5 w-5 ${wordIcon.fg}`} />
                          </div>
                          <div>
                            <p className="font-semibold">{w.headword}</p>
                            <p className="text-xs text-muted-foreground">{w.ipa}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusColor[w.status] as any}>{w.status}</Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite.mutate(w.id);
                            }}
                          >
                            <Star className={`h-4 w-4 ${w.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                          </button>
                        </div>
                      </div>
                      <p className="mb-3 text-sm">{w.meaning}</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_BADGE_COLORS[w.level] ?? "bg-muted text-muted-foreground"}`}>
                            {w.level}
                          </span>
                          {w.collection && (
                            <Badge variant="secondary" className="gap-1">
                              <span>{w.collection.icon ?? <Folder className="h-3 w-3" />}</span> {w.collection.name}
                            </Badge>
                          )}
                          {w.tags.slice(0, 2).map((t) => (
                            <Badge key={t.id} variant="secondary">{t.name}</Badge>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(w);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="More options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
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

const EDIT_TYPES = ["NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG", "PHRASE", "PREPOSITION", "CONJUNCTION", "PRONOUN", "OTHER"];

function WordDetailDialog({
  word, open, onOpenChange, collections,
}: { word: Word | null; open: boolean; onOpenChange: (o: boolean) => void; collections?: any[] }) {
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
      { onSuccess: () => setEditing(false) }
    );
  }

  function addSentence() {
    if (!word || !newSentence.trim()) return;
    createSentence.mutate(
      { text: newSentence.trim(), translation: newSentenceTranslate.trim() || undefined, wordId: word.id },
      { onSuccess: () => { setNewSentence(""); setNewSentenceTranslate(""); } }
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
                className={editing ? "text-primary" : "text-muted-foreground hover:text-primary"}
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
              <Input value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>IPA</Label>
                <Input value={form.ipa} onChange={(e) => setForm({ ...form, ipa: e.target.value })} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDIT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
