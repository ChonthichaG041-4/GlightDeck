import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Volume2, PartyPopper, Star, X, CircleHelp, Check, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useFlashcardQueue, useSubmitReview, useLeeches, useToggleFavorite } from "@/api/hooks";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";
import type { Rating, Word } from "@/types";

// Anki-style 3-grade SRS buttons (Good is intentionally dropped from this UI -
// see srs.ts on the server, which still fully supports it):
//   Again = can't remember at all -> brought back again soon (this same session).
//   Hard  = hard to remember -> shorter next interval than usual.
//   Easy  = easy to remember -> done with this word for this session.
const ratingButtons: {
  rating: Rating;
  label: string;
  icon: typeof X;
  className: string;
}[] = [
  { rating: "AGAIN", label: "Again", icon: X, className: "bg-red-100 text-red-600 hover:bg-red-200" },
  { rating: "HARD", label: "Hard", icon: CircleHelp, className: "bg-amber-100 text-amber-600 hover:bg-amber-200" },
  { rating: "EASY", label: "Easy", icon: Check, className: "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" },
];

const POS_ABBR: Record<string, string> = {
  NOUN: "n.", VERB: "v.", ADJECTIVE: "adj.", ADVERB: "adv.", IDIOM: "idiom",
  SLANG: "slang", PHRASE: "phrase", PREPOSITION: "prep.", CONJUNCTION: "conj.", PRONOUN: "pron.", OTHER: "",
};

export default function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const [collectionId, setCollectionId] = useState(params.get("collectionId") ?? "ALL");
  const [wordIds, setWordIds] = useState(params.get("wordIds") ?? undefined);
  const { data, isLoading, refetch } = useFlashcardQueue(20, collectionId, wordIds);
  const { data: leeches } = useLeeches();
  const submitReview = useSubmitReview();
  const toggleFavorite = useToggleFavorite();

  // The local session queue is a mutable copy of the fetched batch - "Again"
  // reinserts the card a few spots ahead instead of just moving on, so it
  // resurfaces again soon in this same session (not just "due" tomorrow).
  const [queue, setQueue] = useState<Word[] | null>(null);
  const [totalInSession, setTotalInSession] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [isRefilling, setIsRefilling] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // Starting a new session (switching collection / word set) resets everything.
  useEffect(() => {
    setQueue(null);
    setCompletedCount(0);
    setFlipped(false);
  }, [collectionId, wordIds]);

  // Populate the local queue once per session - later background refetches
  // (e.g. submitReview invalidating ["flashcards"]) must NOT reset progress
  // on an in-progress session.
  useEffect(() => {
    if (queue === null && data) {
      setQueue(data.cards);
      setTotalInSession(data.cards.length);
    }
  }, [data, queue]);

  function changeCollection(v: string) {
    setCollectionId(v);
    setWordIds(undefined);
    setParams((p) => {
      if (v === "ALL") p.delete("collectionId"); else p.set("collectionId", v);
      p.delete("wordIds");
      return p;
    });
  }

  const card = queue?.[0];

  function grade(rating: Rating) {
    if (!card || !queue) return;
    const gradedCard = card;
    const rest = queue.slice(1);
    setFlipped(false);

    // Advance the card on screen immediately - don't make the learner wait on
    // a network round trip just to see the next word. The review still gets
    // logged, just in the background.
    if (rating === "AGAIN") {
      const insertAt = Math.min(3, rest.length);
      setQueue([...rest.slice(0, insertAt), gradedCard, ...rest.slice(insertAt)]);
      submitReview.mutate({ wordId: gradedCard.id, rating });
      return;
    }

    setCompletedCount((c) => c + 1);
    setQueue(rest);

    if (rest.length > 0) {
      submitReview.mutate({ wordId: gradedCard.id, rating });
      return;
    }

    // Ran out of cards in this batch - this one edge case does need to wait
    // for the server to record the review before asking it for more due
    // cards (otherwise the just-graded word could come right back).
    setIsRefilling(true);
    submitReview.mutate(
      { wordId: gradedCard.id, rating },
      {
        onSuccess: () => {
          refetch().then((r) => {
            const freshCards = r.data?.cards ?? [];
            setTotalInSession(freshCards.length);
            setCompletedCount(0);
            setQueue(freshCards);
            setIsRefilling(false);
          });
        },
        onError: () => setIsRefilling(false),
      }
    );
  }

  if (isLoading || queue === null) return <p className="text-sm text-muted-foreground">Loading flashcards...</p>;

  if (!card || isRefilling) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <CollectionPicker value={collectionId} onChange={changeCollection} className="w-full" />
        {wordIds && <p className="text-xs text-muted-foreground">กำลังฝึกจากคำที่เลือกไว้ ({wordIds.split(",").length} คำ)</p>}
        {isRefilling ? (
          <p className="text-sm text-muted-foreground">Loading more cards...</p>
        ) : (
          <>
            <PartyPopper className="h-10 w-10 text-primary" />
            <h2 className="text-xl font-semibold">All caught up!</h2>
            <p className="text-sm text-muted-foreground">No cards due right now. Add more words or come back later.</p>
          </>
        )}
      </div>
    );
  }

  const percent = totalInSession > 0 ? Math.round((completedCount / totalInSession) * 100) : 0;
  const posLabel = POS_ABBR[card.type] ?? "";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
      <CollectionPicker value={collectionId} onChange={changeCollection} className="w-full" />
      {leeches && leeches.length > 0 && (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-amber-800">🧠 Smart Review · You often forget</p>
          <div className="flex flex-wrap gap-2">
            {leeches.map((w) => (
              <span key={w.id} className="rounded-full bg-white px-3 py-1 text-amber-700 shadow-sm">{w.headword}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex w-full items-center gap-3">
        <span className="shrink-0 text-sm font-semibold">
          {completedCount} <span className="font-normal text-muted-foreground">/ {totalInSession}</span>
        </span>
        <Progress value={percent} className="h-2.5" />
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{percent}%</span>
      </div>

      <Card
        className="relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl [perspective:1200px]"
        onClick={() => setFlipped((f) => !f)}
      >
        <CardContent className="relative flex min-h-[22rem] w-full flex-col p-6">
          <div className="flex items-start justify-between">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
              {flipped ? "BACK" : "FRONT"}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFavorite.mutate(card.id); }}
              aria-label="Toggle favorite"
              className="text-muted-foreground transition-colors hover:text-amber-500"
            >
              <Star className={cn("h-5 w-5", card.favorite && "fill-amber-400 text-amber-400")} />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            {!flipped ? (
              <>
                <h2 className="text-4xl font-extrabold tracking-tight">{card.headword}</h2>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); speak(card.headword); }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                >
                  <Volume2 className="h-5 w-5" />
                </button>
                <div className="h-px w-2/3 bg-border" />
                <p className="text-lg font-medium">{card.meaning}</p>
                {posLabel && <p className="text-sm italic text-muted-foreground">({posLabel})</p>}
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold">{card.headword}</h2>
                {card.ipa && <p className="text-sm text-muted-foreground">{card.ipa}</p>}
                {card.example && (
                  <div className="max-w-sm space-y-1">
                    <p className="text-sm italic">"{card.example}"</p>
                    {card.exampleTranslate && <p className="text-xs text-muted-foreground">{card.exampleTranslate}</p>}
                  </div>
                )}
                {(card.synonym || card.opposite) && (
                  <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                    {card.synonym && <span>Synonym: <span className="font-medium text-foreground">{card.synonym}</span></span>}
                    {card.opposite && <span>Opposite: <span className="font-medium text-foreground">{card.opposite}</span></span>}
                  </div>
                )}
                {!card.example && !card.synonym && !card.opposite && !card.ipa && (
                  <p className="text-sm text-muted-foreground">No extra details for this word.</p>
                )}
              </>
            )}
          </div>

          {/* Decorative flourish, purely cosmetic. */}
          <svg
            viewBox="0 0 120 120"
            className="pointer-events-none absolute bottom-2 right-2 h-20 w-20 text-primary/20"
            fill="none"
          >
            <circle cx="80" cy="70" r="22" fill="currentColor" opacity="0.5" />
            <ellipse cx="80" cy="70" rx="34" ry="8" stroke="currentColor" strokeWidth="2" opacity="0.6" />
            <path d="M20 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="currentColor" opacity="0.5" />
            <circle cx="30" cy="90" r="3" fill="currentColor" opacity="0.5" />
            <circle cx="45" cy="20" r="2" fill="currentColor" opacity="0.4" />
          </svg>
        </CardContent>
      </Card>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <RotateCw className="h-3.5 w-3.5" /> Tap card to flip
      </button>

      <div className="grid w-full grid-cols-3 gap-3">
        {ratingButtons.map((b) => (
          <button
            key={b.rating}
            disabled={submitReview.isPending}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl py-4 text-sm font-semibold transition-transform active:scale-95 disabled:pointer-events-none disabled:opacity-60",
              b.className
            )}
            onClick={() => grade(b.rating)}
          >
            <b.icon className="h-5 w-5" />
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
