import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Plus, BookText, Wand2,
  BookOpen, Gem, BarChart3, PenLine, ClipboardPaste, FileUp, FileType, Link2, Lock,
  Ruler, Palette, GraduationCap, SpellCheck2, Target, ClipboardList,
  Sparkles, Sprout, Book, MessageCircle, TrendingUp, Star, Crown, Shuffle, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useArticles, useCreateArticle, useGenerateReadingExercise, type ReadingExercise } from "@/api/hooks";
import ReadingWorkspace from "@/components/reading/ReadingWorkspace";
import CreateModeTab from "@/components/reading/CreateModeTab";
import CommunityTab from "@/components/reading/CommunityTab";
import { cn } from "@/lib/utils";

const DIFFICULTY_CARDS: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string }[] = [
  { value: "AUTO", icon: Sparkles, title: "Auto", description: "AI selects the appropriate level" },
  { value: "A1", icon: Sprout, title: "Beginner (A1)", description: "Basic vocabulary and simple sentences" },
  { value: "A2", icon: Book, title: "Elementary (A2)", description: "Everyday topics and simple conversations" },
  { value: "B1", icon: MessageCircle, title: "Intermediate (B1)", description: "Familiar topics and connected ideas" },
  { value: "B2", icon: TrendingUp, title: "Upper Intermediate (B2)", description: "Complex ideas and detailed information" },
  { value: "C1", icon: Star, title: "Advanced (C1)", description: "Abstract topics and advanced language" },
  { value: "C2", icon: Crown, title: "Proficiency (C2)", description: "Sophisticated content and nuanced meaning" },
  { value: "MIXED", icon: Shuffle, title: "Mixed", description: "Mixed levels for varied practice" },
];
const DIFFICULTY_LABELS: Record<string, string> = Object.fromEntries(DIFFICULTY_CARDS.map((d) => [d.value, d.title]));

const EXAM_MODES = [
  { value: "GENERAL_ENGLISH", label: "General English" },
  { value: "IELTS", label: "IELTS" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "TOEIC", label: "TOEIC" },
  { value: "CU_TEP", label: "CU-TEP" },
  { value: "TU_GET", label: "TU-GET" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "KIDS", label: "Kids" },
];

const PASSAGE_SOURCES: { value: string; icon: ComponentType<{ className?: string }>; title: string; description: string; enabled: boolean }[] = [
  { value: "AI_GENERATE", icon: Wand2, title: "AI Generate", description: "Let AI write a fresh passage", enabled: true },
  { value: "WRITE_MYSELF", icon: PenLine, title: "Write Myself", description: "Compose your own text now", enabled: true },
  { value: "IMPORT_TEXT", icon: ClipboardPaste, title: "Import Text", description: "Paste text you already have", enabled: true },
  { value: "UPLOAD_PDF", icon: FileUp, title: "Upload PDF", description: "Coming soon", enabled: false },
  { value: "UPLOAD_DOCX", icon: FileType, title: "Upload DOCX", description: "Coming soon", enabled: false },
  { value: "WEB_URL", icon: Link2, title: "Web Article URL", description: "Coming soon", enabled: false },
];

const LENGTHS = [
  { value: "SHORT", title: "Short", description: "200-300 words" },
  { value: "MEDIUM", title: "Medium", description: "400-700 words" },
  { value: "LONG", title: "Long", description: "800-1500 words" },
  { value: "CUSTOM", title: "Custom", description: "Set exact word count" },
];

const STYLES = [
  { value: "STORY", label: "Story" },
  { value: "NEWS", label: "News" },
  { value: "CONVERSATION", label: "Conversation" },
  { value: "E