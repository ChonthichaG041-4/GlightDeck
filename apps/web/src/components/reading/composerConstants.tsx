// Shared constants for the unified Generate/Create reading composer layout -
// used by both ReadingPage.tsx's "Generate with AI" tab and CreateModeTab.tsx's
// "Create" tab, so Difficulty/Test Mode/Question Type options never drift
// between the two.
import type { ComponentType } from "react";
import {
  Sparkles, Sprout, Book, MessageCircle, TrendingUp, Star, Crown, Shuffle,
  PenLine, ClipboardPaste, FileType, FileUp, FileCode2, ImageIcon,
} from "lucide-react";

export const DIFFICULTY_CARDS: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string }[] = [
  { value: "AUTO", icon: Sparkles, title: "Auto", description: "AI selects the appropriate level" },
  { value: "A1", icon: Sprout, title: "Beginner (A1)", description: "Basic vocabulary and simple sentences" },
  { value: "A2", icon: Book, title: "Elementary (A2)", description: "Everyday topics and simple conversations" },
  { value: "B1", icon: MessageCircle, title: "Intermediate (B1)", description: "Familiar topics and connected ideas" },
  { value: "B2", icon: TrendingUp, title: "Upper Intermediate (B2)", description: "Complex ideas and detailed information" },
  { value: "C1", icon: Star, title: "Advanced (C1)", description: "Abstract topics and advanced language" },
  { value: "C2", icon: Crown, title: "Proficiency (C2)", description: "Sophisticated content and nuanced meaning" },
  { value: "MIXED", icon: Shuffle, title: "Mixed", description: "Mixed levels for varied practice" },
];
export const DIFFICULTY_LABELS: Record<string, string> = Object.fromEntries(DIFFICULTY_CARDS.map((d) => [d.value, d.title]));

export const TEST_MODES = [
  { value: "READING_ONLY", label: "Reading Only" },
  { value: "TRANSLATION", label: "Reading + Translation" },
  { value: "QUESTIONS", label: "Reading + Questions" },
  { value: "VOCABULARY", label: "Reading + Vocabulary" },
  { value: "GRAMMAR", label: "Reading + Grammar" },
  { value: "MIXED", label: "Mixed" },
];

export const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "YES_NO_NOTGIVEN", label: "Yes / No / Not Given" },
  { value: "FILL_BLANK", label: "Fill in the Blank" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "ESSAY", label: "Essay" },
  { value: "MATCHING", label: "Matching" },
  { value: "ORDERING", label: "Ordering" },
  { value: "HIGHLIGHT_SENTENCE", label: "Highlight Sentence" },
  { value: "CLICK_WORD", label: "Click Word" },
  { value: "MIXED", label: "Mixed" },
];
export const QUESTION_COUNTS = [5, 10, 15, 20];

// Content Source: how the passage body is authored/obtained. AI_GENERATE is
// only used on the "Generate with AI" tab; the rest are Create tab options.
export const CONTENT_SOURCES: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string; enabled: boolean }[] = [
  { value: "WRITE_MANUALLY", icon: PenLine, title: "Write Manually", description: "Compose your own text in the editor", enabled: true },
  { value: "PASTE_TEXT", icon: ClipboardPaste, title: "Paste Text", description: "Coming soon", enabled: false },
  { value: "IMPORT_DOCX", icon: FileType, title: "Import DOCX", description: "Coming soon", enabled: false },
  { value: "IMPORT_PDF", icon: FileUp, title: "Import PDF", description: "Coming soon", enabled: false },
  { value: "IMPORT_MARKDOWN", icon: FileCode2, title: "Import Markdown", description: "Coming soon", enabled: false },
  { value: "IMPORT_BOOK", icon: ImageIcon, title: "Import Book/Reading", description: "Photo/scan OCR - opens a guided import wizard", enabled: true },
];
