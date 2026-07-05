import { useState } from "react";
import { Heart, Eye, Star, Users, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCommunityPassages, usePassage, useToggleLike, useSubmitRating } from "@/api/hooks";
import ReadingWorkspace from "@/components/reading/ReadingWorkspace";
import { cn } from "@/lib/utils";

export default function CommunityTab() {
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) {
    return <CommunityReader id={openId} onBack={() => setOpenId(null)} />;
  }

  return <CommunityList onOpen={setOpenId} />;
}

function CommunityList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: passages, isLoading } = useCommunityPassages();
  const toggleLike = useToggleLike();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (!passages || passages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <Users className="h-8 w-8" />
        <p>ยังไม่มีบทความสาธารณะ - ลอง Publish บทความของคุณจากแท็บ "Generate with AI" หรือ "Create" ดูก่อน</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {passages.map((p) => (
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
            <Button size="sm" className="mt-1 w-full gap-1.5" onClick={() => onOpen(p.id)}>
              <BookOpen className="h-3.5 w-3.5" /> Read
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CommunityReader({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: passage, isLoading } = usePassage(id);
  const submitRating = useSubmitRating();

  if (isLoading || !passage) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <ReadingWorkspace
        articleId={id}
        title={passage.title}
        passage={passage.content}
        translation={passage.translation ?? undefined}
        questions={passage.questions}
        testMode={passage.testMode ?? "READING_ONLY"}
        metaLine={`โดย ${passage.authorName}${passage.cefrLevel ? ` · ${passage.cefrLevel}` : ""}`}
        onBack={onBack}
        readOnly
      />
      <RatingCard passageId={id} myRating={passage.stats.myRating} onRate={(r) => submitRating.mutate({ articleId: id, rating: r })} />
    </div>
  );
}

function RatingCard({ myRating, onRate }: { passageId: string; myRating: number | null; onRate: (r: number) => void }) {
  return (
    <Card className="mx-auto max-w-6xl">
      <CardContent className="flex items-center justify-center gap-1 p-4">
        <span className="mr-2 text-sm text-muted-foreground">Rate this passage:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onRate(n)}>
            <Star className={cn("h-5 w-5", myRating && n <= myRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
