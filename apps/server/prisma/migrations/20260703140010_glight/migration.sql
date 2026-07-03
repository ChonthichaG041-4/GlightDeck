-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "sourceLang" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "WordTranslation" (
    "id" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wordId" TEXT NOT NULL,

    CONSTRAINT "WordTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordTranslation_wordId_lang_key" ON "WordTranslation"("wordId", "lang");

-- AddForeignKey
ALTER TABLE "WordTranslation" ADD CONSTRAINT "WordTranslation_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
