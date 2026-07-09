import { NavLink } from "react-router-dom";
import {
  Home, BookOpen, Layers, Headphones, BookText, ListChecks, BarChart3, Sparkles, Library, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/vocabulary", label: "Vocabulary", icon: BookOpen },
  { to: "/articles", label: "Articles", icon: Library },
  { to: "/reading", label: "Reading", icon: BookText },
  { to: "/listening", label: "Listening", icon: Headphones },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-lg font-bold tracking-tight">GlightDeck</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="rounded-lg bg-accent p-3 text-xs text-accent-foreground">
        <p className="font-semibold">Daily Challenge</p>
        <p className="mt-1 opacity-80">Keep your streak alive - review a few cards today.</p>
      </div>
    </>
  );
}

// Desktop: a static, always-visible column (unchanged behavior). Below `md`
// there is no room for a permanent sidebar, so it's replaced entirely by the
// slide-in drawer version rendered by MobileSidebar (opened via a hamburger
// button in Topbar) - without that, small/mobile screens had no navigation
// at all once the static sidebar disappeared at the `md` breakpoint.
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card px-3 py-4 md:flex">
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cn("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col border-r bg-card px-3 py-4 shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  );
}
