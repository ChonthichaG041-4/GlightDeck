import { useNavigate } from "react-router-dom";
import { Search, Flame, Menu } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";
import { Input } from "@/components/ui/input";
import { AiAssistantDialog } from "./AiAssistantDialog";
import { SentencesDialog } from "./SentencesDialog";
import { useHomeSummary } from "@/api/hooks";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const navigate = useNavigate();
  const { data: home } = useHomeSummary();

  return (
    <header className="flex h-16 items-center gap-2 border-b bg-card/60 px-3 backdrop-blur sm:gap-4 md:px-6">
      {onMenuClick && (
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuClick}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search words, meanings, tags..."
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value;
              navigate(`/vocabulary?search=${encodeURIComponent(value)}`);
            }
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {home && (
          <div className="hidden items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-600 sm:flex">
            <Flame className="h-4 w-4" />
            {home.streak} Days
          </div>
        )}
        <SentencesDialog />
        <AiAssistantDialog />
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
