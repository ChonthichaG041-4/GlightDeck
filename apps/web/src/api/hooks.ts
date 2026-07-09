import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Word, Collection, Tag, Article, SentenceBookmark, Achievement, HomeSummary, StatsSummary, Rating,
} from "@/types";

// ---------- Dashboard / Home ----------
export function useHomeSummary() {
  return useQuery({
    queryKey: ["home"],
    queryFn: async () => (await api.get<HomeSummary>("/dashboard/home")).data,
  });
}

// ---------- Words / Vocabulary ----------
export function useWords(filters: Record<string, string | undefined> = {}, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["words", filters],
    queryFn: async () => (await api.get<Word[]>("/words", { params: filters })).data,
    enabled: opts?.enabled ?? true,
  });
}

export function useWord(id: string | undefined) {
  return useQuery({
    queryKey: ["word", id],
    queryFn: async () => (await api.get<Word>(`/words/${id}`)).data,
    enabled: !!id,
  });
}

export interface WordInput extends Partial<Omit<Word, "collection" | "tags" | "id" | "translations">> {
  headword: string;
  meaning: string;
  collectionId?: string;
  tagIds?: string[];
  translations?: Record<string, string>;
}

export function useCreateWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WordInput) => (await api.post<Word>("/words", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
  });
}

export function useUpdateWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Word> & { id: string; collectionId?: string | null }) =>
      (await api.patch<Word>(`/words/${id}`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["words"] });
      qc.invalidateQueries({ queryKey: ["collections"] }); // wordCount per collection may have changed
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.patch<Word>(`/words/${id}/favorite`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
  });
}

export function useDeleteWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/words/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
  });
}

export function useLeeches() {
  return useQuery({
    queryKey: ["words", "leeches"],
    queryFn: async () => (await api.get<Word[]>("/words/leeches")).data,
  });
}

// ---------- Collections ----------
export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: async () => (await api.get<Collection[]>("/collections")).data,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Collection> & { name: string }) =>
      (await api.post<Collection>("/collections", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections"] }),
  });
}

// ---------- Tags ----------
export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/tags")).data,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; color?: string }) => (await api.post<Tag>("/tags", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

// ---------- Flashcards / SRS ----------
export function useFlashcardQueue(limit = 20, collectionId?: string, wordIds?: string) {
  return useQuery({
    queryKey: ["flashcards", "queue", limit, collectionId, wordIds],
    queryFn: async () =>
      (await api.get<{ dueCount: number; newCount: number; cards: Word[] }>("/flashcards/queue", { params: { limit, collectionId, wordIds } })).data,
  });
}

export function useWordLookup() {
  return useMutation({
    mutationFn: async (payload: { headword: string; sourceLang: string; targetLangs: string[] }) =>
      (
        await api.post<{
          source: string;
          ipa: string | null;
          type: string;
          level: string;
          example: string | null;
          translations: Record<string, string>;
        }>("/words/lookup", payload)
      ).data,
  });
}

export interface GeneratedWordItem {
  headword: string;
  ipa: string | null;
  type: string;
  level: string | null;
  example: string | null;
  translations: Record<string, string>;
}

// ---------- AI vocabulary-set generator ----------
export function useGenerateWordSet() {
  return useMutation({
    mutationFn: async (payload: {
      topic: string;
      sourceLang: string;
      targetLangs: string[];
      cefrLevel: string;
      style: string;
      scope: string;
      count: number;
    }) =>
      (
        await api.post<{ source: string; words: GeneratedWordItem[]; note?: string }>("/ai/generate-set", payload)
      ).data,
  });
}

export function useBulkCreateWords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sourceLang: string;
      collectionId?: string;
      newCollectionName?: string;
      words: Array<{ headword: string; ipa?: string | null; type: string; level: string; example?: string | null; translations: Record<string, string> }>;
    }) => (await api.post<{ imported: number; collectionId: string | null }>("/words/bulk", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["words"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wordId, rating }: { wordId: string; rating: Rating }) =>
      (await api.post<Word>(`/flashcards/${wordId}/review`, { rating })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

// ---------- Listening ----------
export function useListeningSession(mode: "choice" | "dictation", limit = 10, collectionId?: string, wordIds?: string) {
  return useQuery({
    queryKey: ["listening", mode, limit, collectionId, wordIds],
    queryFn: async () =>
      (await api.get("/listening/session", { params: { mode, limit, collectionId, wordIds } })).data as {
        mode: string;
        questions: any[];
      },
  });
}

export function useSubmitListeningAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { correctCount: number; totalCount: number }) =>
      (await api.post("/listening/attempt", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home"] }),
  });
}

export interface ListeningQuestion {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "SHORT_ANSWER";
  skill: string;
  prompt: string;
  options: string[];
  answer: string;
}

export interface ListeningExercise {
  transcript: string;
  translation?: string;
  questions?: ListeningQuestion[];
}

// ---------- AI listening-exercise generator (custom Listening practice builder) ----------
export function useGenerateListeningExercise() {
  return useMutation({
    mutationFn: async (payload: {
      topic: string;
      cefrLevel: string;
      paragraphs: number | "AUTO";
      length: string;
      assessmentSkills: string[];
      testMode: "TRANSLATION" | "QUESTIONS";
      questionTypes: string[];
      numQuestions: number;
      targetLang: string;
      examMode: string;
    }) =>
      (
        await api.post<{ source: string; exercise: ListeningExercise | null; note?: string }>(
          "/listening/generate-exercise",
          payload
        )
      ).data,
  });
}

// ---------- Reading ----------
export function useArticles(category?: string) {
  return useQuery({
    queryKey: ["articles", category],
    queryFn: async () => (await api.get<Article[]>("/reading/articles", { params: { category } })).data,
  });
}

export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: ["article", id],
    queryFn: async () => (await api.get<Article>(`/reading/articles/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; category: string; content: string; source?: string }) =>
      (await api.post<Article>("/reading/articles", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["articles"] }),
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reading/articles/${id}`);
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["articles"] }),
  });
}

export function useMarkArticleRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post(`/reading/mark-read/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home"] }),
  });
}

// ---------- AI reading-exercise generator (custom Reading practice builder) ----------
export type ReadingQuestionType =
  | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "YES_NO_NOTGIVEN" | "FILL_BLANK" | "SHORT_ANSWER"
  | "ESSAY" | "MATCHING" | "ORDERING";

export interface ReadingQuestion {
  type: ReadingQuestionType;
  skill: string;
  prompt: string;
  options: string[];
  answer: string;
  // MATCHING/ORDERING don't fit the flat options/answer shape above - authored
  // manually via the Create Mode Question Builder (not AI-generated).
  pairs?: { left: string; right: string }[]; // MATCHING
  items?: string[]; // ORDERING - listed here in the correct order
  // Educational Analysis tag (Import Book/Reading only, for now) - a CEFR
  // difficulty estimate kept separate from the structural fields above.
  difficulty?: string;
}

export interface ReadingExercise {
  title: string;
  passage: string;
  translation?: string;
  questions?: ReadingQuestion[];
}

export function useGenerateReadingExercise() {
  return useMutation({
    mutationFn: async (payload: {
      topic: string;
      passageSource: string;
      manualText: string;
      description?: string;
      tags?: string[];
      cefrLevel: string;
      examMode: string;
      length: string;
      customWordCount: number;
      styles: string[];
      vocabLevel: string;
      grammarFocus: string[];
      readingSkills: string[];
      testMode: string;
      questionTypes: string[];
      numQuestions: number;
      targetLang: string;
    }) =>
      (
        await api.post<{ source: string; exercise: ReadingExercise | null; articleId?: string; note?: string }>(
          "/reading/generate-exercise",
          payload
        )
      ).data,
  });
}

export function useSubmitReadingAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { correctCount: number; totalCount: number; articleId?: string }) =>
      (await api.post("/reading/attempt", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home"] }),
  });
}

// ---------- Reading Workspace + Create Mode + Community ----------
export interface PassageStats {
  views: number;
  likes: number;
  liked: boolean;
  attempts: number;
  avgScorePercent: number | null;
  avgRating: number | null;
  ratingCount: number;
  myRating: number | null;
}

export interface HighlightItem {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
  createdAt: string;
}

export interface NoteItem {
  id: string;
  text: string;
  anchorText?: string | null;
  anchorOffset?: number | null;
  createdAt: string;
}

export interface BookmarkItem {
  id: string;
  anchorText?: string | null;
  anchorOffset?: number | null;
  createdAt: string;
}

// Rich block-editor content type (Heading/Paragraph/Image/Quote/Table/Code/Divider) -
// mirrors apps/server/src/lib/blocks.ts. Article.content stays the flattened
// plain-text mirror so the rest of the app (Reading Workspace, word lookups,
// highlight offsets) never needs to know blocks exist.
export type Block =
  | { id: string; type: "HEADING"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "PARAGRAPH"; text: string }
  | { id: string; type: "IMAGE"; url: string; caption?: string }
  | { id: string; type: "QUOTE"; text: string }
  | { id: string; type: "TABLE"; rows: string[][] }
  | { id: string; type: "CODE"; code: string; language?: string }
  | { id: string; type: "DIVIDER" };

export type ContentSource =
  | "AI_GENERATE" | "WRITE_MANUALLY" | "PASTE_TEXT" | "IMPORT_DOCX" | "IMPORT_PDF" | "IMPORT_MARKDOWN" | "IMPORT_BOOK";

export interface VocabularyItem {
  headword: string;
  meaning: string;
  ipa?: string | null;
}

export interface PassageDetail {
  id: string;
  title: string;
  category: string;
  content: string;
  description?: string | null;
  tags?: string[];
  contentSource?: string | null;
  blocks?: Block[] | null;
  vocabularyMode?: string | null;
  vocabulary?: VocabularyItem[] | null;
  translation?: string | null;
  questions: ReadingQuestion[] | null;
  examMode?: string | null;
  cefrLevel?: string | null;
  testMode?: string | null;
  visibility: "PRIVATE" | "PUBLIC" | "UNLISTED";
  viewCount: number;
  createdAt: string;
  authorId: string;
  authorName: string;
  isOwner: boolean;
  stats: PassageStats;
  highlights: HighlightItem[];
  notes: NoteItem[];
  bookmarks: BookmarkItem[];
}

export function usePassage(id: string | undefined) {
  return useQuery({
    queryKey: ["passage", id],
    queryFn: async () => (await api.get<PassageDetail>(`/reading/passages/${id}`)).data,
    enabled: !!id,
  });
}

export interface UpdatePassagePayload {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  content?: string;
  translation?: string;
  blocks?: Block[];
  contentSource?: ContentSource;
  cefrLevel?: string;
  testMode?: string;
  vocabularyMode?: "AUTO" | "MANUAL" | "NONE";
  vocabulary?: VocabularyItem[];
  questions?: ReadingQuestion[];
  visibility?: string;
}

export function useUpdatePassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdatePassagePayload) =>
      (await api.patch<{ id: string; visibility: string }>(`/reading/passages/${id}`, payload)).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["passage", vars.id] });
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

export interface CreatePassagePayload {
  title: string;
  content: string;
  description?: string;
  translation?: string;
  category?: string;
  tags?: string[];
  blocks?: Block[];
  contentSource?: ContentSource;
  cefrLevel?: string;
  testMode?: string;
  vocabularyMode?: "AUTO" | "MANUAL" | "NONE";
  vocabulary?: VocabularyItem[];
  questions?: ReadingQuestion[];
}

export function useCreatePassage() {
  return useMutation({
    mutationFn: async (payload: CreatePassagePayload) =>
      (await api.post<{ id: string }>("/reading/passages", payload)).data,
  });
}

export function useCommunityPassages() {
  return useQuery({
    queryKey: ["community"],
    queryFn: async () => (await api.get<PassageDetail[]>("/reading/community")).data,
  });
}

// Both highlight mutations below update the local ["passage", articleId] cache
// synchronously in onMutate (optimistic update) so the mark appears/disappears
// on screen instantly, instead of waiting a full network round trip. onSettled
// still invalidates to reconcile with the server (e.g. real id, or roll back on
// a genuine failure) - that refetch happens quietly in the background.
export function useCreateHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ articleId, ...payload }: { articleId: string; text: string; startOffset: number; endOffset: number; color?: string }) =>
      (await api.post<HighlightItem>(`/reading/passages/${articleId}/highlights`, payload)).data,
    onMutate: async ({ articleId, ...payload }) => {
      await qc.cancelQueries({ queryKey: ["passage", articleId] });
      const previous = qc.getQueryData<PassageDetail>(["passage", articleId]);
      if (previous) {
        const optimistic: HighlightItem = {
          id: `optimistic-${Math.random().toString(36).slice(2)}`,
          text: payload.text,
          startOffset: payload.startOffset,
          endOffset: payload.endOffset,
          color: payload.color ?? "#fde68a",
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData<PassageDetail>(["passage", articleId], { ...previous, highlights: [...previous.highlights, optimistic] });
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) qc.setQueryData(["passage", vars.articleId], context.previous);
    },
    onSettled: (_d, _err, vars) => qc.invalidateQueries({ queryKey: ["passage", vars.articleId] }),
  });
}

export function useDeleteHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, articleId }: { id: string; articleId: string }) => {
      try {
        await api.delete(`/reading/highlights/${id}`);
      } catch (err: any) {
        // Already gone (e.g. a duplicate click, or a stale cache after the
        // article itself was deleted elsewhere) - the desired end state is
        // already true, so don't surface this as a failure.
        if (err?.response?.status !== 404) throw err;
      }
      return { articleId };
    },
    onMutate: async ({ id, articleId }) => {
      await qc.cancelQueries({ queryKey: ["passage", articleId] });
      const previous = qc.getQueryData<PassageDetail>(["passage", articleId]);
      if (previous) {
        qc.setQueryData<PassageDetail>(["passage", articleId], {
          ...previous,
          highlights: previous.highlights.filter((h) => h.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) qc.setQueryData(["passage", vars.articleId], context.previous);
    },
    onSettled: (_d, _err, vars) => qc.invalidateQueries({ queryKey: ["passage", vars.articleId] }),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ articleId, ...payload }: { articleId: string; text: string; anchorText?: string; anchorOffset?: number }) =>
      (await api.post<NoteItem>(`/reading/passages/${articleId}/notes`, payload)).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["passage", vars.articleId] }),
  });
}

// Used by the floating Note tool's autosave - updates the same note row in
// place (no "Save" button; called on a short debounce after each edit).
export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, articleId, text }: { id: string; articleId: string; text: string }) =>
      (await api.patch<NoteItem>(`/reading/notes/${id}`, { text })).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["passage", vars.articleId] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, articleId }: { id: string; articleId: string }) => {
      await api.delete(`/reading/notes/${id}`);
      return { articleId };
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["passage", data.articleId] }),
  });
}

export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ articleId, anchorOffset, anchorText }: { articleId: string; anchorOffset: number; anchorText?: string }) =>
      (await api.post<{ bookmarked: boolean }>(`/reading/passages/${articleId}/bookmarks`, { anchorOffset, anchorText })).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["passage", vars.articleId] }),
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (articleId: string) =>
      (await api.post<{ liked: boolean; likesCount: number }>(`/reading/passages/${articleId}/like`)).data,
    onSuccess: (_d, articleId) => {
      qc.invalidateQueries({ queryKey: ["passage", articleId] });
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

export function useSubmitRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ articleId, rating }: { articleId: string; rating: number }) =>
      (await api.post<{ myRating: number; avgRating: number; ratingCount: number }>(`/reading/passages/${articleId}/rating`, { rating })).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["passage", vars.articleId] });
      qc.invalidateQueries({ queryKey: ["community"] });
    },
  });
}

export interface ExplainSentenceResult {
  grammar: string;
  vocabulary: string;
  naturalTranslation: string;
  literalTranslation: string;
}

export function useExplainSentence() {
  return useMutation({
    mutationFn: async (payload: { sentence: string; passageContext?: string; targetLang?: string }) =>
      (await api.post<{ source: string; result: ExplainSentenceResult | null; note?: string }>("/ai/explain-sentence", payload)).data,
  });
}

export function useWritingAssist() {
  return useMutation({
    mutationFn: async (payload: { paragraph: string; instruction: "CONTINUE" | "IMPROVE" | "FIX_GRAMMAR" | "SHORTEN" | "EXPAND" | "SIMPLIFY" }) =>
      (await api.post<{ source: string; text: string | null; note?: string }>("/ai/writing-assist", payload)).data,
  });
}

// ---------- Unified Generate/Create composer: imports + whole-passage AI actions ----------

export interface ImportedDocument {
  title: string;
  blocks: Block[];
  content: string;
}

export function useImportDocx() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<ImportedDocument>("/reading/import/docx", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
  });
}

export function useImportPdf() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<ImportedDocument>("/reading/import/pdf", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
  });
}

export function useImportMarkdown() {
  return useMutation({
    mutationFn: async (text: string) => (await api.post<ImportedDocument>("/reading/import/markdown", { text })).data,
  });
}

// Import Book/Reading (OCR): one or more page photos of a book/exam page,
// merged server-side into one passage + question set via Gemini vision.
// Backs the multi-step Import Wizard (see ImportBookWizard.tsx).
export interface ImportedBookDocument extends ImportedDocument {
  level?: string | null;
  instruction?: string | null;
  confidence?: number | null;
  pagesProcessed: number;
  questions: ReadingQuestion[];
}

export function useImportBook() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("images", f));
      return (await api.post<ImportedBookDocument>("/reading/import/book", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
  });
}

export function useVocabularyDetect() {
  return useMutation({
    mutationFn: async (payload: { passage: string; targetLang?: string; max?: number }) =>
      (await api.post<{ source: string; vocabulary: VocabularyItem[]; note?: string }>("/ai/vocabulary-detect", payload)).data,
  });
}

export function useGenerateQuestionsForPassage() {
  return useMutation({
    mutationFn: async (payload: { passage: string; numQuestions?: number; targetLang?: string }) =>
      (await api.post<{ source: string; questions: ReadingQuestion[]; note?: string }>("/ai/generate-questions-for-passage", payload)).data,
  });
}

export function useGenerateSummary() {
  return useMutation({
    mutationFn: async (payload: { passage: string; targetLang?: string }) =>
      (await api.post<{ source: string; summary: string | null; note?: string }>("/ai/generate-summary", payload)).data,
  });
}

export function useGenerateTranslation() {
  return useMutation({
    mutationFn: async (payload: { passage: string; targetLang?: string }) =>
      (await api.post<{ source: string; translation: string | null; note?: string }>("/ai/generate-translation", payload)).data,
  });
}

// ---------- Quiz ----------
export function useQuizQuestions(type: string, limit = 10, collectionId?: string, wordIds?: string) {
  return useQuery({
    queryKey: ["quiz", type, limit, collectionId, wordIds],
    queryFn: async () => (await api.get("/quiz/generate", { params: { type, limit, collectionId, wordIds } })).data,
    enabled: !!type,
  });
}

export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: string; score: number; total: number; wrongWordIds?: string[] }) =>
      (await api.post("/quiz/submit", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

// ---------- Stats ----------
export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => (await api.get<StatsSummary>("/stats")).data,
  });
}

// ---------- AI Assistant ----------
export function useAiExplain() {
  return useMutation({
    mutationFn: async (text: string) => (await api.post("/ai/explain", { text })).data,
  });
}

export interface WordDetailResult {
  word: string;
  ipa: string | null;
  audioUrl: string | null; // real Wiktionary/Wikimedia Commons pronunciation audio, when available
  partOfSpeech: string;
  level: string;
  frequency: number;
  meanings: string[];
  example: { text: string; translation: string } | null;
  synonyms: string[];
  antonyms: string[];
  wordFamily: string[];
}

// Reading Workspace's double-click dictionary popup - richer than useWordLookup
// (which only prefills the Add Word form): full meanings/example/synonyms/
// antonyms/word family/frequency for read-only display.
export function useWordDetail() {
  return useMutation({
    mutationFn: async (payload: { word: string; sourceLang?: string; targetLang?: string }) =>
      (await api.post<{ source: string; result: WordDetailResult | null; note?: string }>("/ai/word-detail", payload)).data,
  });
}

export interface GrammarPoint {
  title: string;
  explanation: string;
  example: string;
}

// Reading Workspace's "Reading + Grammar" sidebar box - identifies grammar
// points actually used in the passage and explains each one.
export function useGrammarNotes(articleId: string | undefined, passage: string, enabled: boolean) {
  return useQuery({
    queryKey: ["grammar-notes", articleId],
    queryFn: async () =>
      (await api.post<{ source: string; points: GrammarPoint[]; note?: string }>("/ai/grammar-notes", { passage })).data,
    enabled: enabled && !!articleId && !!passage,
  });
}

// ---------- Sentences ----------
export function useSentences() {
  return useQuery({
    queryKey: ["sentences"],
    queryFn: async () => (await api.get<SentenceBookmark[]>("/sentences")).data,
  });
}

export function useCreateSentence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { text: string; translation?: string; wordId?: string }) =>
      (await api.post<SentenceBookmark>("/sentences", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sentences"] }),
  });
}

// ---------- Achievements ----------
export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: async () => (await api.get<Achievement[]>("/achievements")).data,
  });
}

// ---------- Import ----------
export function useImportPaste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { text: string; collectionId?: string }) =>
      (await api.post("/import/paste", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
  });
}

export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { file: File; collectionId?: string }) => {
      const form = new FormData();
      form.append("file", payload.file);
      if (payload.collectionId) form.append("collectionId", payload.collectionId);
      return (await api.post("/import/file", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
  });
}

// ---------- Word relationships (mindmap) ----------
export function useWordRelations(wordId: string | undefined) {
  return useQuery({
    queryKey: ["relations", wordId],
    queryFn: async () => (await api.get(`/relations/${wordId}`)).data,
    enabled: !!wordId,
  });
}
