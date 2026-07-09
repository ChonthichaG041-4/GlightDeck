-- Articles hub: Article gets a workflow status (Draft/Published/Archived,
-- separate from ArticleVisibility which is about who can see it), plus
-- user-created "Study Lists" for grouping their own articles in My Articles
-- (Category stays Community-only per the new IA).

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill: articles already PUBLIC were effectively "published" - keep that true
-- under the new status field too, so nothing already-shared silently disappears
-- from Community once Community starts filtering on status.
UPDATE "Article" SET "status" = 'PUBLISHED' WHERE "visibility" = 'PUBLIC';

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateTable
CREATE TABLE "StudyList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StudyList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyListArticle" (
    "studyListId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyListArticle_pkey" PRIMARY KEY ("studyListId","articleId")
);

-- CreateIndex
CREATE INDEX "StudyList_userId_idx" ON "StudyList"("userId");

-- CreateIndex
CREATE INDEX "StudyListArticle_articleId_idx" ON "StudyListArticle"("articleId");

-- AddForeignKey
ALTER TABLE "StudyList" ADD CONSTRAINT "StudyList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyListArticle" ADD CONSTRAINT "StudyListArticle_studyListId_fkey" FOREIGN KEY ("studyListId") REFERENCES "StudyList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyListArticle" ADD CONSTRAINT "StudyListArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
