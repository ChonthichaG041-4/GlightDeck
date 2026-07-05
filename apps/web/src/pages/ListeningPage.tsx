import { useEffect, useRef, useState, type ReactNode, type ComponentType } from "react";
import {
  Play, Pause, RotateCcw, Wand2, ArrowLeft, CheckCircle2, XCircle,
  Headphones, BookOpen, Gem, BarChart3, FileText, Clock, Mic, Globe, Gauge,
  Sparkles, Sprout, Book, MessageCircle, TrendingUp, Star, Crown, Shuffle,
  Check, Minus, Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useGenerateListeningExercise, useSubmitListeningAttempt,
  type ListeningExercise, type ListeningQuestion,
} from "@/api/hooks";
import {
  speakPassage, pauseSpeech, resumeSpeech, cancelSpeech, speedToRate,
  type Accent, type VoiceGender,
} from "@/lib/tts";
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
const LENGTHS = [
  { value: "SHORT", label: "Short" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LONG", label: "Long" },
];
const EXAM_MODES = [
  { value: "IELTS", label: "IELTS" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "TOEIC", label: "TOEIC" },
  { value: "CU_TEP", label: "CU-TEP" },
  { value: "TU_GET", label: "TU-GET" },
  { value: "GENERAL_ENGLISH", label: "General English" },
];
const VOICES = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
];
const ACCENTS = [
  { value: "AMERICAN", label: "American" },
  { value: "BRITISH", label: "British" },
  { value: "AUSTRALIAN", label: "Australian" },
];
const SPEEDS = [
  { value: "SLOW", label: "Slow" },
  { value: "NORMAL", label: "Normal" },
  { value: "FAST", label: "Fast" },
];

const SKILLS = [
  { value: "GIST", label: "Listening for Gist" },
  { value: "DETAILS", label: "Listening for Details" },
  { value: "INFERENCE", label: "Inference" },
  { value: "ATTITUDE_EMOTION", label: "Attitude & Emotion" },
  { value: "SPEAKERS_PURPOSE", label: "Speaker's Purpose" },
  { value: "SEQUENCING", label: "Sequencing" },
  { value: "VOCAB_IN_CONTEXT", label: "Vocabulary from Context" },
  { value: "INFORMATION_CONNECTIONS", label: "Information Connections" },
  { value: "SUMMARIZING", label: "Summarizing" },
  { value: "FOLLOWING_INSTRUCTIONS", label: "Following Instructions" },
  { value: "MIXED", label: "Mixed Skills" },
];

const TEST_MODES = [
  { value: "TRANSLATION", label: "Listening + Translation" },
  { value: "QUESTIONS", label: "Listening + Questions" },
];
const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "FILL_BLANK", label: "Fill in the Blank" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "MIXED", label: "Mixed" },
];
const QUESTION_COUNTS = [5, 10, 15];
const LISTEN_LIMIT_OPTIONS = [1, 2, 3, 4, 5];

export default function ListeningPage() {
  // ---- Setup state ----
  const [topic, setTopic] = useState("");
  const [examMode, setExamMode] = useState("GENERAL_ENGLISH");
  const [cefrLevel, setCefrLevel] = useState("AUTO");
  const [paragraphMode, setParagraphMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [paragraphCount, setParagraphCount] = useState(5);
  const [length, setLength] = useState("MEDIUM");
  const [voice, setVoice] = useState<VoiceGender>("FEMALE");
  const [accent, setAccent] = useState<Accent>("AMERICAN");
  const [speakingSpeed, setSpeakingSpeed] = useState<"SLOW" | "NORMAL" | "FAST">("NORMAL");
  const [skills, setSkills] = useState<string[]>(["MIXED"]);
  const [testMode, setTestMode] = useState<"TRANSLATION" | "QUESTIONS">("QUESTIONS");
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MIXED"]);
  cons