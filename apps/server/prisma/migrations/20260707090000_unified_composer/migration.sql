-- Unified Generate/Create reading composer: shared Title/Description/Category/Tags/
-- Difficulty/Test Mode/Content Source layout, rich block-editor content, and a
-- per-article vocabulary list (Auto Detect / Manual / None).

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "description" TEXT;
ALTER TABLE "Article" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Article" ADD COLUMN "contentSource" TEXT;
ALTER TABLE "Article" ADD COLUMN "blocksJson" JSONB;
ALTER TABLE "Article" ADD COLUMN "vocabularyMode" TEXT DEFAULT 'NONE';
ALTER TABLE "Article" ADD COLUMN "vocabularyJson" JSONB;
