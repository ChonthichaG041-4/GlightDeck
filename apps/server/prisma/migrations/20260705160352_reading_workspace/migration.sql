-- Reading Workspace + Create Mode: persisted reading passages get richer
-- metadata (translation/questions/exam settings/visibility/view count) plus
-- six new tables for highlights, notes, bookmarks, likes, attempts, and
-- ratings on a passage (Article row).

-- CreateEnum
CREATE TYPE "ArticleVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'UNLISTED');

-- AlterTable
ALTER TABLE "Article"
  ADD COLUMN "translation" TEXT,
  ADD COLUMN "questionsJson" JSONB,
  ADD COLUMN "examMode" TEXT,
  ADD COLUMN "cefrLevel" TEXT,
  ADD COLUMN "testMode" TEXT,
  ADD COLUMN "visibility" "ArticleVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Article_visibility_idx" ON "Article"("visibility");

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#fde68a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "anchorText" TEXT,
    "anchorOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingBookmark" (
    "id" TEXT NOT NULL,
    "anchorText" TEXT,
    "anchorOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ReadingBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleLike" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleAttempt" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRating" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_articleId_userId_idx" ON "Highlight"("articleId", "userId");

-- CreateIndex
CREATE INDEX "Note_articleId_userId_idx" ON "Note"("articleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingBookmark_articleId_userId_anchorOffset_key" ON "ReadingBookmark"("articleId", "userId", "anchorOffset");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleLike_articleId_userId_key" ON "ArticleLike"("articleId", "userId");

-- CreateIndex
CREATE INDEX "ArticleAttempt_articleId_idx" ON "ArticleAttempt"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRating_articleId_userId_key" ON "ArticleRating"("articleId", "userId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingBookmark" ADD CONSTRAINT "ReadingBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingBookmark" ADD CONSTRAINT "ReadingBookmark_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLike" ADD CONSTRAINT "ArticleLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLike" ADD CONSTRAINT "ArticleLike_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAttempt" ADD CONSTRAINT "ArticleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAttempt" ADD CONSTRAINT "ArticleAttempt_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRating" ADD CONSTRAINT "ArticleRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRating" ADD CONSTRAINT "ArticleRating_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
