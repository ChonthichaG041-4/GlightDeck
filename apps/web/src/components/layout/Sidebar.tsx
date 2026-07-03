import { NavLink } from "react-router-dom";
import {
  Home, BookOpen, Layers, Headphones, BookText, ListChecks, BarChart3, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/vocabulary", label: "Vocabulary", icon: BookOpen },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/listening", label: "Listening", icon: Headphones },
  { to: "/reading", label: "Reading", icon: BookText },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card px-3 py-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-lg font-bold tracking-tight">LingoDeck</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
    </aside>
  );
}
