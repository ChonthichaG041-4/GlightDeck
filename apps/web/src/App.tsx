import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
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
const EditArticlePage = lazy(() => import("@/pages/EditArticlePage"));
const CreatePracticePage = lazy(() => import("@/pages/CreatePracticePage"));
const VocabularyPage = lazy(() => import("@/pages/VocabularyPage"));
const FlashcardsPage = lazy(() => import("@/pages/FlashcardsPage"));
const ListeningReaderPage = lazy(() => import("@/pages/ListeningReaderPage"));
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

// Old id-based routes (/articles/:id, /reading/:id, /reading/:id/edit,
// /listening/:id) redirect here onto their new Article-resource equivalents,
// so any bookmarked/shared links from before this migration keep working.
function RedirectWithId({ to }: { to: (id: string) => string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? to(id) : "/articles"} replace />;
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
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />

          {/* Create Practice - replaces the old top-level Reading/Listening generator pages */}
          <Route path="/create" element={<CreatePracticePage />} />
          <Route path="/article/new" element={<CreatePracticePage />} />

          {/* Article resource - Article is the primary resource; Reading and
              Listening are just two ways of practicing the same Article. */}
          <Route path="/article/:id" element={<ArticleDetailPage />} />
          <Route path="/article/:id/edit" element={<EditArticlePage />} />
          <Route path="/article/:id/practice/reading" element={<ArticleReaderPage />} />
          <Route path="/article/:id/practice/listening" element={<ListeningReaderPage />} />

          {/* Legacy redirects */}
          <Route path="/articles/:id" element={<RedirectWithId to={(id) => `/article/${id}`} />} />
          <Route path="/reading" element={<Navigate to="/create" replace />} />
          <Route path="/reading/:id/edit" element={<RedirectWithId to={(id) => `/article/${id}/edit`} />} />
          <Route path="/reading/:id" element={<RedirectWithId to={(id) => `/article/${id}/practice/reading`} />} />
          <Route path="/listening" element={<Navigate to="/create" replace />} />
          <Route path="/listening/:id" element={<RedirectWithId to={(id) => `/article/${id}/practice/listening`} />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
