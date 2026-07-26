-- Pre-generated Listening audio for OCR-imported articles (Import
-- ReadingBook/Image wizard). Populated during the "AI is Processing" step so
-- Listening practice can play back stored MP3s instead of re-synthesizing
-- on every visit. Nullable - only OCR-imported articles set these today.

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "audioUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN "articleAudioUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN "questionsAudioUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN "choicesAudioUrl" TEXT;
