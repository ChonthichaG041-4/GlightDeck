import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn, SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAttachAuthToken } from "@/api/client";

import HomePage from "@/pages/HomePage";
import VocabularyPage from "@/pages/VocabularyPage";
import FlashcardsPage from "@/pages/FlashcardsPage";
import ListeningPage from "@/pages/ListeningPage";
import ReadingPage from "@/pages/ReadingPage";
import ArticleReaderPage from "@/pages/ArticleReaderPage";
import QuizPage from "@/pages/QuizPage";
import StatisticsPage from "@/pages/StatisticsPage";

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
    <Routes>
      <Route path="/sign-in/*" element={<div className="flex h-screen items-center justify-center"><SignIn  /></div>} />
      <Route path="/sign-up/*" element={<div className="flex h-screen items-center justify-center"><SignUp  /></div>} />

      <Route element={<ProtectedShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/flashcards" element={<FlashcardsPage />} />
        <Route path="/listening" element={<ListeningPage />} />
        <Route path="/reading" element={<ReadingPage />} />
        <Route path="/reading/:id" element={<ArticleReaderPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
