import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollections } from "@/api/hooks";

export function CollectionPicker({
  value,
  onChange,
  className,
  includeAllWords,
}: {
  value: string; // "ALL", "ALL_WORDS" (if includeAllWords), or a collection id
  onChange: (value: string) => void;
  className?: string;
  includeAllWords?: boolean;
}) {
  const { data: collections } = useCollections();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "w-48"}>
        <SelectValue placeholder="All collections" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All collections</SelectItem>
        {includeAllWords && <SelectItem value="ALL_WORDS">All words</SelectItem>}
        {collections?.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.icon} {c.name} ({c.wordCount})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
