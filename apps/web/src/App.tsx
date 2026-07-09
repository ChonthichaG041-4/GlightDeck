import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn, SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAttachAuthToken } from "@/api/client";

// Lazy-load every page so navigating to one page doesn't force-download every
// other page's code up front (Vocabulary, Reading's block editor/import
// wizard, Statistics' recharts, etc. were all landing in one giant bundle that
// every route had to wait on before it could render).
const HomePage = lazy(() => import("@/pages/HomePage"));
const ArticlesPage = lazy(() => import("@/pages/ArticlesPage"));
const ArticleDetailPage = lazy(() => import("@/pages/ArticleDetailPage"));
const VocabularyPage = lazy(() => import("@/pages/VocabularyPage"));
const FlashcardsPage = lazy(() => import("@/pages/FlashcardsPage"));
const ListeningPage = lazy(() => import("@/pages/ListeningPage"));
const ListeningReaderPage = lazy(() => import("@/pages/ListeningReaderPage"));
const ReadingPage = lazy(() => import("@/pages/ReadingPage"));
const ArticleReaderPage = lazy(() => import("@/pages/ArticleReaderPage"));
const QuizPage = lazy(() => import("@/pages/QuizPage"));
const StatisticsPage = lazy(() => import("@/pages/StatisticsPage"));

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    useAttachAuthToken(() => getToken());
  }, [getToken]);
  return null;
}

function ProtectedShell() {
  return (
    <>
      <SignedIn>
        <AuthBridge />
        <AppLayout />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/sign-in/*" element={<div className="flex h-screen items-center justify-center"><SignIn  /></div>} />
        <Route path="/sign-up/*" element={<div className="flex h-screen items-center justify-center"><SignUp  /></div>} />

        <Route element={<ProtectedShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/articles/:id" element={<ArticleDetailPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/listening" element={<ListeningPage />} />
          <Route path="/listening/:id" element={<ListeningReaderPage />} />
          <Route path="/reading" element={<ReadingPage />} />
          <Route path="/reading/:id/edit" element={<ReadingPage />} />
          <Route path="/reading/:id" element={<ArticleReaderPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
