import { useState } from "react";
import { Quote, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useSentences, useCreateSentence } from "@/api/hooks";

export function SentencesDialog() {
  const { data: sentences } = useSentences();
  const createSentence = useCreateSentence();
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 px-2 sm:px-3">
          <Quote className="h-4 w-4" /> <span className="hidden sm:inline">Sentences</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Quote className="h-4 w-4" /> Bookmarked Sentences</DialogTitle>
          <DialogDescription>Save memorable sentences from anything you read.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input placeholder="Actions speak louder than words." value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Input placeholder="แปล (optional)" value={translation} onChange={(e) => setTranslation(e.target.value)} />
        <Button
          size="sm"
          className="gap-2 self-start"
          onClick={() => {
            if (!text.trim()) return;
            createSentence.mutate({ text: text.trim(), translation: translation.trim() || undefined }, {
              onSuccess: () => { setText(""); setTranslation(""); },
            });
          }}
        >
          <Plus className="h-4 w-4" /> Save
        </Button>

        <div className="mt-2 max-h-64 space-y-3 overflow-y-auto">
          {sentences?.map((s) => (
            <div key={s.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">"{s.text}"</p>
              {s.translation && <p className="mt-1 text-muted-foreground">{s.translation}</p>}
            </div>
          ))}
          {sentences?.length === 0 && <p className="text-sm text-muted-foreground">No sentences saved yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
