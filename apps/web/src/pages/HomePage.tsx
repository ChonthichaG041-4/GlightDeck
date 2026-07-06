import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Flame, Headphones, Layers, Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useHomeSummary } from "@/api/hooks";

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function HomePage() {
  const { data, isLoading } = useHomeSummary();

  const stats = [
    { label: "Words to Review", value: data?.wordsToReview ?? 0, icon: Layers, color: "text-indigo-600 bg-indigo-100" },
    { label: "New Words", value: data?.newWords ?? 0, icon: BookOpen, color: "text-emerald-600 bg-emerald-100" },
    { label: "Listening", value: data?.listening ?? 0, icon: Headphones, color: "text-sky-600 bg-sky-100" },
    { label: "Reading", value: `${data?.readingArticles ?? 0} Article`, icon: Newspaper, color: "text-amber-600 bg-amber-100" },
  ];

  const challenge = data?.dailyChallenge;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {timeGreeting()}, {isLoading ? "..." : data?.greetingName}
        </h1>
        <p className="text-muted-foreground">Let's keep your vocabulary growing today.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span>📖</span> Today
            </h2>
            <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-600">
              <Flame className="h-4 w-4" />
              Streak : {data?.streak ?? 0} Days
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border p-4">
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full ${s.color}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <Button asChild className="mt-6 gap-2">
            <Link to="/flashcards">
              Continue Learning <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {challenge && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold">🎯 Daily Challenge</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Review", challenge.review],
                  ["Listening", challenge.listening],
                  ["Meaning", challenge.meaning],
                  ["Sentences", challenge.sentence],
                ] as const
              ).map(([label, c]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">
                      {c.done}/{c.target}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (c.done / c.target) * 100)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Collections</h2>
          <Link to="/vocabulary" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data?.recentCollections.map((c) => (
            <Link key={c.id} to={`/vocabulary?collectionId=${c.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-5 text-center">
                  <span className="text-2xl">{c.icon}</span>
                  <p className="text-sm font-medium leading-tight">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.wordCount} words</p>
                </CardContent>
              </Card>
            </Link>
          ))}
          {!isLoading && data?.recentCollections.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              No collections yet. Create one from the Vocabulary page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
