import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Volume2, PartyPopper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFlashcardQueue, useSubmitReview, useLeeches } from "@/api/hooks";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";
import type { Rating } from "@/types";

const ratingButtons: { rating: Rating; label: string; className: string }[] = [
  { rating: "AGAIN", label: "Again", className: "bg-red-500 hover:bg-red-600 text-white" },
  { rating: "HARD", label: "Hard", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { rating: "GOOD", label: "Good", className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { rating: "EASY", label: "Easy", className: "bg-sky-500 hover:bg-sky-600 text-white" },
];

export default function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const [collectionId, setCollectionId] = useState(params.get("collectionId") ?? "ALL");
  const { data, isLoading, refetch } = useFlashcardQueue(20, collectionId);
  const { data: leeches } = useLeeches();
  const submitReview = useSubmitReview();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  function changeCollection(v: string) {
    setCollectionId(v);
    setIndex(0);
    setParams((p) => { if (v === "ALL") p.delete("collectionId"); else p.set("collectionId", v); return p; });
  }

  const cards = data?.cards ?? [];
  const card = cards[index];
  const total = cards.length;

  function grade(rating: Rating) {
    if (!card) return;
    submitReview.mutate(
      { wordId: card.id, rating },
      {
        onSuccess: () => {
          setFlipped(false);
          if (index + 1 < total) setIndex(index + 1);
          else refetch().then(() => setIndex(0));
        },
      }
    );
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading flashcards...</p>;

  if (!card) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <CollectionPicker value={collectionId} onChange={changeCollection} className="w-full" />
        <PartyPopper className="h-10 w-10 text-primary" />
        <h2 className="text-xl font-semibold">All caught up!</h2>
        <p className="text-sm text-muted-foreground">No cards due right now. Add more words or come back later.</p>
      </div>
    );
  }

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
      <div className="w-full">
        <div className="mb-2 flex justify-between text-sm text-muted-foreground">
          <span>Reviewing</span>
          <span>{index + 1} / {total}</span>
        </div>
        <Progress value={(index / total) * 100} />
      </div>

      <Card
        className="flex h-80 w-full cursor-pointer items-center justify-center [perspective:1200px]"
        onClick={() => setFlipped((f) => !f)}
      >
        <CardContent className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
          {!flipped ? (
            <>
              <span className="text-6xl">{card.image}</span>
              <h2 className="text-4xl font-extrabold tracking-wide">{card.headword.toUpperCase()}</h2>
              <p className="text-sm text-muted-foreground">Tap the card to flip</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{card.headword}</h2>
                <button onClick={(e) => { e.stopPropagation(); speak(card.headword); }}>
                  <Volume2 className="h-5 w-5 text-muted-foreground hover:text-primary" />
                </button>
              </div>
              <p className="text-lg">{card.meaning}</p>
              <p className="text-sm text-muted-foreground">{card.ipa}</p>
              {card.example && <p className="max-w-sm text-sm italic text-muted-foreground">"{card.example}"</p>}
            </>
          )}
        </CardContent>
      </Card>

      {flipped ? (
        <div className="grid w-full grid-cols-4 gap-2">
          {ratingButtons.map((b) => (
            <button
              key={b.rating}
              className={cn("rounded-lg py-3 text-sm font-semibold transition-transform active:scale-95", b.className)}
              onClick={() => grade(b.rating)}
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : (
        <Button size="lg" onClick={() => setFlipped(true)}>Flip</Button>
      )}
    </div>
  );
}
