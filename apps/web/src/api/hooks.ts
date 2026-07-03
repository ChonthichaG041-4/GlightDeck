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
export function useWords(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: ["words", filters],
    queryFn: async () => (await api.get<Word[]>("/words", { params: filters })).data,
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
    mutationFn: async ({ id, ...payload }: Partial<Word> & { id: string }) =>
      (await api.patch<Word>(`/words/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["words"] }),
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
export function useFlashcardQueue(limit = 20, collectionId?: string) {
  return useQuery({
    queryKey: ["flashcards", "queue", limit, collectionId],
    queryFn: async () =>
      (await api.get<{ dueCount: number; newCount: number; cards: Word[] }>("/flashcards/queue", { params: { limit, collectionId } })).data,
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
export function useListeningSession(mode: "choice" | "dictation", limit = 10, collectionId?: string) {
  return useQuery({
    queryKey: ["listening", mode, limit, collectionId],
    queryFn: async () =>
      (await api.get("/listening/session", { params: { mode, limit, collectionId } })).data as {
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

export function useMarkArticleRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post(`/reading/mark-read/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home"] }),
  });
}

// ---------- Quiz ----------
export function useQuizQuestions(type: string, limit = 10, collectionId?: string) {
  return useQuery({
    queryKey: ["quiz", type, limit, collectionId],
    queryFn: async () => (await api.get("/quiz/generate", { params: { type, limit, collectionId } })).data,
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
