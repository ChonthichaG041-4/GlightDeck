// Shared small UI primitives for the Reading composer (Generate + Create tabs).
// Moved out of ReadingPage.tsx so CreateModeTab.tsx and the new composer
// sub-components (PassageMetaFields, BlockEditor, QuestionBuilder, ...) can
// reuse the exact same look and feel instead of re-implementing it.
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldLabel({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon}
      {text}
    </div>
  );
}

export function OptionCard({
  active, onClick, icon, title, description, disabled, badge,
}: { active: boolean; onClick: () => void; icon?: ReactNode; title: string; description: string; disabled?: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : active ? "border-primary bg-primary/5" : "hover:bg-accent"
      )}
    >
      {badge && <span className="absolute right-2 top-2 text-muted-foreground">{badge}</span>}
      {!disabled && (
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border",
            active ? "border-primary bg-primary" : "border-muted-foreground/40"
          )}
        >
          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
      )}
      {icon && <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{icon}</span>}
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

export function PillButton({
  active, onClick, children, showCheck,
}: { active: boolean; onClick: () => void; children: ReactNode; showCheck?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
      {active && showCheck && <Check className="h-3 w-3" />}
    </button>
  );
}
