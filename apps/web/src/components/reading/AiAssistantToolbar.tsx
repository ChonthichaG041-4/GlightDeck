// AI Assistant toolbar: Improve Grammar / Simplify apply to the currently
// selected block; Generate Questions / Generate Vocabulary / Generate Summary
// / Generate Translation act on the whole passage.
import { useState } from "react";
import { Wand2, SpellCheck2, ListChecks, BookMarked, AlignLeft, Languages, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useWritingAssist, useGenerateQuestionsForPassage, useVocabularyDetect,
  useGenerateSummary, useGenerateTranslation, type ReadingQuestion, type VocabularyItem,
} from "@/api/hooks";

export default function AiAssistantToolbar({
  passage,
  selectedBlockText,
  onApplyToSelectedBlock,
  onQuestionsGenerated,
  onVocabularyGenerated,
  onSummaryGenerated,
  onTranslationGenerated,
}: {
  passage: string;
  selectedBlockText: string | null;
  onApplyToSelectedBlock: (text: string) => void;
  onQuestionsGenerated: (questions: ReadingQuestion[]) => void;
  onVocabularyGenerated: (vocabulary: VocabularyItem[]) => void;
  onSummaryGenerated: (summary: string) => void;
  onTranslationGenerated: (translation: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const writingAssist = useWritingAssist();
  const generateQuestions = useGenerateQuestionsForPassage();
  const vocabularyDetect = useVocabularyDetect();
  const generateSummary = useGenerateSummary();
  const generateTranslation = useGenerateTranslation();

  function needsPassage(): boolean {
    if (!passage.trim()) {
      setError("เขียนเนื้อหาก่อนใช้ AI Assistant");
      return false;
    }
    return true;
  }

  function runAssist(instruction: "FIX_GRAMMAR" | "SIMPLIFY") {
    if (!selectedBlockText || !selectedBlockText.trim()) {
      setError("เลือก Block ที่มีข้อความก่อน (คลิกที่ย่อหน้าที่ต้องการ)");
      return;
    }
    setError(null);
    setPending(instruction);
    writingAssist.mutate(
      { paragraph: selectedBlockText, instruction },
      {
        onSuccess: (data) => { setPending(null); if (data.text) onApplyToSelectedBlock(data.text); },
        onError: () => { setPending(null); setError("AI ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง"); },
      }
    );
  }

  function runQuestions() {
    if (!needsPassage()) return;
    setError(null);
    setPending("QUESTIONS");
    generateQuestions.mutate(
      { passage, targetLang: "th" },
      {
        onSuccess: (data) => { setPending(null); onQuestionsGenerated(data.questions ?? []); },
        onError: () => { setPending(null); setError("สร้างคำถามไม่สำเร็จ ลองใหม่อีกครั้ง"); },
      }
    );
  }

  function runVocabulary() {
    if (!needsPassage()) return;
    setError(null);
    setPending("VOCAB");
    vocabularyDetect.mutate(
      { passage, targetLang: "th" },
      {
        onSuccess: (data) => { setPending(null); onVocabularyGenerated(data.vocabulary ?? []); },
        onError: () => { setPending(null); setError("สร้างคำศัพท์ไม่สำเร็จ ลองใหม่อีกครั้ง"); },
      }
    );
  }

  function runSummary() {
    if (!needsPassage()) return;
    setError(null);
    setPending("SUMMARY");
    generateSummary.mutate(
      { passage, targetLang: "th" },
      {
        onSuccess: (data) => { setPending(null); if (data.summary) onSummaryGenerated(data.summary); },
        onError: () => { setPending(null); setError("สร้างสรุปไม่สำเร็จ ลองใหม่อีกครั้ง"); },
      }
    );
  }

  function runTranslation() {
    if (!needsPassage()) return;
    setError(null);
    setPending("TRANSLATION");
    generateTranslation.mutate(
      { passage, targetLang: "th" },
      {
        onSuccess: (data) => { setPending(null); if (data.translation) onTranslationGenerated(data.translation); },
        onError: () => { setPending(null); setError("แปลไม่สำเร็จ ลองใหม่อีกครั้ง"); },
      }
    );
  }

  const buttons = [
    { key: "FIX_GRAMMAR", label: "Improve Grammar", icon: SpellCheck2, onClick: () => runAssist("FIX_GRAMMAR") },
    { key: "SIMPLIFY", label: "Simplify", icon: Wand2, onClick: () => runAssist("SIMPLIFY") },
    { key: "QUESTIONS", label: "Generate Questions", icon: ListChecks, onClick: runQuestions },
    { key: "VOCAB", label: "Generate Vocabulary", icon: BookMarked, onClick: runVocabulary },
    { key: "SUMMARY", label: "Generate Summary", icon: AlignLeft, onClick: runSummary },
    { key: "TRANSLATION", label: "Generate Translation", icon: Languages, onClick: runTranslation },
  ];

  return (
    <div className="space-y-2 rounded-lg border bg-accent/20 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4" /> AI Assistant</p>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => (
          <Button key={b.key} size="sm" variant="outline" className="gap-1.5 text-xs" onClick={b.onClick} disabled={pending !== null}>
            <b.icon className="h-3.5 w-3.5" /> {pending === b.key ? "กำลังทำงาน..." : b.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
