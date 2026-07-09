import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Volume2, RefreshCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuizQuestions, useSubmitQuiz } from "@/api/hooks";
import { CollectionPicker } from "@/components/layout/CollectionPicker";
import { speak } from "@/lib/tts";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "MATCHING", label: "Matching" },
  { value: "MEANING", label: "Meaning" },
  { value: "SENTENCE", label: "Sentence" },
  { value: "LISTENING", label: "Listening" },
];

export default function QuizPage() {
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState("MULTIPLE_CHOICE");
  const [collectionId, setCollectionId] = useState(params.get("collectionId") ?? "ALL");
  const [wordIds, setWordIds] = useState(params.get("wordIds") ?? undefined);

  function changeCollection(v: string) {
    setCollectionId(v);
    setWordIds(undefined);
    setParams((p) => {
      if (v === "ALL") p.delete("collectionId"); else p.set("collectionId", v);
      p.delete("wordIds");
      return p;
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">Quiz</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={type} onValueChange={setType}>
            <TabsList className="flex-wrap">
              {TYPES.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <CollectionPicker value={collectionId} onChange={changeCollection} />
        </div>
        {wordIds && <p className="text-xs text-muted-foreground">กำลังฝึกจากคำที่เลือกไว้ ({wordIds.split(",").length} คำ)</p>}
      </div>
      {type === "MATCHING" ? (
        <MatchingQuiz collectionId={collectionId} wordIds={wordIds} />
      ) : (
        <SequentialQuiz type={type} collectionId={collectionId} wordIds={wordIds} />
      )}
    </div>
  );
}

function SequentialQuiz({ type, collectionId, wordIds }: { type: string; collectionId: string; wordIds?: string }) {
  const { data, isLoading, refetch } = useQuizQuestions(type, 8, collectionId, wordIds);
  const submitQuiz = useSubmitQuiz();
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  useEffect(() => { setIndex(0); setScore(0); setWrongIds([]); setInput(""); setFeedback(null); }, [type]);

  const questions = data?.questions ?? [];
  const q = questions[index];

  function answer(isCorrect: boolean, wordId?: string) {
    setFeedback(isCorrect ? "correct" : "wrong");
    const nextScore = score + (isCorrect ? 1 : 0);
    const nextWrong = isCorrect || !wordId ? wrongIds : [...wrongIds, wordId];
    setScore(nextScore);
    setWrongIds(nextWrong);

    setTimeout(() => {
      setFeedback(null);
      setInput("");
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        submitQuiz.mutate({ type, score: nextScore, total: questions.length, wrongWordIds: nextWrong });
        setIndex(0);
        setScore(0);
        setWrongIds([]);
        refetch();
      }
    }, 700);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!q) return <p className="py-16 text-center text-sm text-muted-foreground">Not enough words yet for this quiz type.</p>;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">
          Question {index + 1} / {questions.length} · Score {score}
        </p>

        {feedback && (
          <div className={cn("flex items-center gap-1 text-sm font-semibold", feedback === "correct" ? "text-emerald-600" : "text-red-600")}>
            {feedback === "correct" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {feedback === "correct" ? "Correct!" : `Answer: ${q.answer}`}
          </div>
        )}

        {type === "MULTIPLE_CHOICE" && (
          <>
            <h2 className="text-2xl font-bold">{q.prompt}</h2>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {q.options.map((opt: string, i: number) => (
                <Button key={`${opt}-${i}`} variant="outline" className="h-11" onClick={() => answer(opt === q.answer, q.wordId)}>{opt}</Button>
              ))}
            </div>
          </>
        )}

        {type === "MEANING" && (
          <>
            <p className="text-sm text-muted-foreground">Meaning</p>
            <h2 className="text-2xl font-bold">{q.prompt}</h2>
            <div className="flex w-full gap-2">
              <Input placeholder="Type the word..." value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)} />
              <Button onClick={() => answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)}>Submit</Button>
            </div>
          </>
        )}

        {type === "SENTENCE" && (
          <>
            <p className="text-center text-lg">{q.sentence}</p>
            <div className="flex w-full gap-2">
              <Input placeholder="Fill in the blank..." value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)} />
              <Button onClick={() => answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)}>Submit</Button>
            </div>
          </>
        )}

        {type === "LISTENING" && (
          <>
            <button
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              onClick={() => speak(q.audioText)}
            >
              <Volume2 className="h-8 w-8" />
            </button>
            <div className="flex w-full gap-2">
              <Input placeholder="Type what you hear..." value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)} />
              <Button onClick={() => answer(input.trim().toLowerCase() === q.answer.toLowerCase(), q.wordId)}>Submit</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MatchingQuiz({ collectionId, wordIds }: { collectionId: string; wordIds?: string }) {
  const { data, isLoading, refetch } = useQuizQuestions("MATCHING", 6, collectionId, wordIds);
  const submitQuiz = useSubmitQuiz();
  const group = data?.questions?.[0];
  const [leftPick, setLeftPick] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);

  useEffect(() => { setLeftPick(null); setMatched([]); }, [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!group) return <p className="py-16 text-center text-sm text-muted-foreground">Not enough words yet for matching.</p>;

  const done = matched.length === group.left.length && group.left.length > 0;

  function pickRight(rightId: string) {
    if (!leftPick) return;
    if (rightId === leftPick) {
      const next = [...matched, rightId];
      setMatched(next);
      setLeftPick(null);
      if (next.length === group!.left.length) {
        submitQuiz.mutate({ type: "MATCHING", score: next.length, total: group!.left.length });
      }
    } else {
      setWrongFlash(rightId);
      setTimeout(() => setWrongFlash(null), 400);
      setLeftPick(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-8">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-semibold">All matched!</p>
            <Button className="gap-2" onClick={() => refetch()}><RefreshCcw className="h-4 w-4" /> New Set</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="space-y-2">
              {group.left.map((l: any) => (
                <button
                  key={l.id}
                  disabled={matched.includes(l.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                    matched.includes(l.id) ? "opacity-30" : leftPick === l.id ? "border-primary bg-accent" : "hover:bg-accent"
                  )}
                  onClick={() => setLeftPick(l.id)}
                >
                  {l.text}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {group.right.map((r: any) => (
                <button
                  key={r.id}
                  disabled={matched.includes(r.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm transition-colors",
                    matched.includes(r.id) ? "opacity-30" : wrongFlash === r.id ? "border-destructive bg-destructive/10" : "hover:bg-accent"
                  )}
                  onClick={() => pickRight(r.id)}
                >
                  {r.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
