import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, BookText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useArticles, useCreateArticle } from "@/api/hooks";

export default function ReadingPage() {
  const { data: articles, isLoading } = useArticles();
  const categories = Array.from(new Set(articles?.map((a) => a.category) ?? []));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reading</h1>
          <p className="text-sm text-muted-foreground">Read articles and tap any word to add it to your vocabulary.</p>
        </div>
        <AddArticleDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {categories.map((category) => (
        <div key={category}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{category}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {articles?.filter((a) => a.category === category).map((a) => (
              <Link key={a.id} to={`/reading/${a.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <BookText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {!isLoading && articles?.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No articles yet - add your first one.</p>
      )}
    </div>
  );
}

function AddArticleDialog() {
  const [open, setOpen] = useState(false);
  const createArticle = useCreateArticle();
  const [form, setForm] = useState({ title: "", category: "News", content: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Article</Button>
      </DialogTrigger>
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
            onClick={() => createArticle.mutate(form, { onSuccess: () => { setOpen(false); setForm({ title: "", category: "News", content: "" }); } })}
          >
            Save article
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
