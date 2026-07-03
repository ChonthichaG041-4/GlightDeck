import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollections } from "@/api/hooks";

export function CollectionPicker({
  value,
  onChange,
  className,
}: {
  value: string; // "ALL" or a collection id
  onChange: (value: string) => void;
  className?: string;
}) {
  const { data: collections } = useCollections();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "w-48"}>
        <SelectValue placeholder="All collections" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All collections</SelectItem>
        {collections?.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.icon} {c.name} ({c.wordCount})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
