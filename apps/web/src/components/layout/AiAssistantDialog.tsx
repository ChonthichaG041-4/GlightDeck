import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useAiExplain } from "@/api/hooks";

export function AiAssistantDialog() {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const explain = useAiExplain();

  function handleAsk() {
    if (!text.trim()) return;
    explain.mutate(text.trim());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Assistant
          </DialogTitle>
          <DialogDescription>Ask about any word, phrase, or idiom - e.g. "Take off"</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Explain "Take off"'
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <Button onClick={handleAsk} disabled={explain.isPending}>
            {explain.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
        </div>

        {explain.data && (
          <div className="mt-4 space-y-3 rounded-lg bg-muted p-4 text-sm">
            <div>
              <p className="font-semibold text-muted-foreground">ความหมาย</p>
              <p>{explain.data.meaning}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground">ตัวอย่าง</p>
              <p>{explain.data.example}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground">ใช้เมื่อไร</p>
              <p>{explain.data.usage}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground">เปรียบเทียบ</p>
              <p>{explain.data.contrast}</p>
            </div>
          </div>
        )}
        {explain.isError && <p className="mt-3 text-sm text-destructive">Something went wrong. Try again.</p>}
      </DialogContent>
    </Dialog>
  );
}
