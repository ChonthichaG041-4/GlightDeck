import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useCollections, useCreateCollection, useTags, useCreateTag } from "@/api/hooks";

export function ManageDialog() {
  const { data: collections } = useCollections();
  const { data: tags } = useTags();
  const createCollection = useCreateCollection();
  const createTag = useCreateTag();
  const [collectionName, setCollectionName] = useState("");
  const [tagName, setTagName] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FolderKanban className="h-4 w-4" /> Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collections & Tags</DialogTitle>
          <DialogDescription>Organize your vocabulary into custom collections and tags.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="collections">
          <TabsList>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="collections" className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Fantasy, Daily, Business, Travel..." value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
              <Button
                size="icon"
                onClick={() => {
                  if (!collectionName.trim()) return;
                  createCollection.mutate({ name: collectionName.trim() }, { onSuccess: () => setCollectionName("") });
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {collections?.map((c) => (
                <Badge key={c.id} variant="secondary">{c.icon} {c.name} ({c.wordCount})</Badge>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tags" className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="IELTS, TOEIC, Novel, Movie, Anime, Game, Work, KKU..." value={tagName} onChange={(e) => setTagName(e.target.value)} />
              <Button
                size="icon"
                onClick={() => {
                  if (!tagName.trim()) return;
                  createTag.mutate({ name: tagName.trim() }, { onSuccess: () => setTagName("") });
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags?.map((t) => (
                <Badge key={t.id} variant="outline">{t.name} ({t.wordCount ?? 0})</Badge>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
