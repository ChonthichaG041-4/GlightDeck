export type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type WordType =
  | "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "IDIOM" | "SLANG"
  | "PHRASE" | "PREPOSITION" | "CONJUNCTION" | "PRONOUN" | "OTHER";

export type WordStatus = "NEW" | "LEARNING" | "REVIEW" | "MASTERED";

export type Rating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  wordCount?: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  wordCount?: number;
  updatedAt?: string;
}

export interface WordTranslation {
  id?: string;
  lang: string;
  text: string;
}

export interface Word {
  id: string;
  headword: string;
  sourceLang: string;
  meaning: string;
  ipa?: string | null;
  type: WordType;
  level: Level;
  example?: string | null;
  exampleTranslate?: string | null;
  synonym?: string | null;
  opposite?: string | null;
  frequency: number;
  image?: string | null;
  audioUrl?: string | null;
  status: WordStatus;
  favorite: boolean;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: string;
  lastReviewedAt?: string | null;
  createdAt: string;
  tags: Tag[];
  translations?: WordTranslation[];
  collection?: Collection | null;
  isLeech?: boolean;
}

export interface Article {
  id: string;
  title: string;
  category: string;
  content?: string;
  source?: string | null;
  createdAt: string;
}

export interface SentenceBookmark {
  id: string;
  text: string;
  translation?: string | null;
  createdAt: string;
  word?: Word | null;
}

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface HomeSummary {
  greetingName: string;
  wordsToReview: number;
  newWords: number;
  listening: number;
  readingArticles: number;
  streak: number;
  dailyChallenge: Record<"review" | "listening" | "typing" | "sentence", { done: number; target: number }>;
  recentCollections: Collection[];
}

export interface StatsSummary {
  wordsLearned: number;
  mastered: number;
  learning: number;
  review: number;
  newWords: number;
  forgotten: number;
  accuracy: number;
  currentStreak: number;
  longestStreak: number;
  reviewActivity: { date: string; count: number }[];
  breakdown: { name: string; value: number }[];
}
