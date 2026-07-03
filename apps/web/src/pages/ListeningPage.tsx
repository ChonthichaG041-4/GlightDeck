import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Volume2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListeningSession, useSubmitListeningAttempt } from "@/api/hooks";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

export default function ListeningPage() {
  const [params, setParams] = useSearchParams();
  const [collectionId, setCollectionId] = useState(params.get("collectionId") ?? "ALL");
  const [wordIds, setWordIds] = useState(params.get("wordIds") ?? undefined);
  const [mode, setMode] = useState<"choice" | "dictation">("choice");
  const { data, isLoading, refetch } = useListeningSession(mode, 10, collectionId, wordIds);
  const submitAttempt = useSubmitListeningAttempt();

  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const questions = data?.questions ?? [];
  const q = questions[index];

  function next(wasCorrect: boolean) {
    const newCorrect = correct + (wasCorrect ? 1 : 0);
    setCorrect(newCorrect);
    setFeedback(wasCorrect ? "correct" : "wrong");
    setTimeout(() => {
      setFeedback(null);
      setAnswer("");
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        submitAttempt.mutate({ correctCount: newCorrect, totalCount: questions.length });
        setIndex(0);
        setCorrect(0);
        refetch();
      }
    }, 700);
  }

  function changeMode(m: "choice" | "dictation") {
    setMode(m);
    setIndex(0);
    setCorrect(0);
    setAnswer("");
  }

  function changeCollection(v: string) {
    setCollectionId(v);
    setWordIds(undefined);
    setIndex(0);
    setCorrect(0);
    setParams((p) => {
      if (v === "ALL") p.delete("collectionId"); else p.set("collectionId", v);
      p.delete("wordIds");
      return p;
    });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
      <div className="w-full space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">Listening</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={mode} onValueChange={(v) => changeMode(v as any)}>
            <TabsList>
              <TabsTrigger value="choice">Multiple Choice</TabsTrigger>
              <TabsTrigger value="dictation">Dictation</TabsTrigger>
            </TabsList>
          </Tabs>
          <CollectionPicker value={collectionId} onChange={changeCollection} />
        </div>
        {wordIds && <p className="text-xs text-muted-foreground">กำลังฝึกจากคำที่เลือกไว้ ({wordIds.split(",").length} คำ)</p>}
      </div>

      {!q ? (
        <p className="py-16 text-sm text-muted-foreground">No words available yet - add some vocabulary first.</p>
      ) : (
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <p className="text-sm text-muted-foreground">Question {index + 1} / {questions.length}</p>
            <button
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
              onClick={() => speak(q.audioText)}
            >
              <Volume2 className="h-8 w-8" />
            </button>

            {feedback && (
              <div className={cn("flex items-center gap-1 text-sm font-semibold", feedback === "correct" ? "text-emerald-600" : "text-red-600")}>
                {feedback === "correct" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {feedback === "correct" ? "Correct!" : "Not quite"}
              </div>
            )}

            {mode === "choice" ? (
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map((opt: string) => (
                  <Button key={opt} variant="outline" className="h-11" onClick={() => next(opt === q.answer)}>
                    {opt}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex w-full gap-2">
                <Input
                  placeholder="Type what you hear..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && next(answer.trim().toLowerCase() === q.answer.toLowerCase())}
                />
                <Button onClick={() => next(answer.trim().toLowerCase() === q.answer.toLowerCase())}>Submit</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
