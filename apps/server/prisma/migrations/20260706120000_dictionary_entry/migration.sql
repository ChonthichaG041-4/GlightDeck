-- Reference dictionary data imported offline from Kaikki.org's Wiktionary
-- extract, powering the Reading Workspace's dictionary popup (real IPA/audio/
-- synonyms/antonyms/Thai translations) - see apps/server/scripts/import-kaikki.ts.

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "ipa" TEXT,
    "audioUrl" TEXT,
    "senses" JSONB NOT NULL,
    "synonyms" TEXT[],
    "antonyms" TEXT[],
    "translations" JSONB NOT NULL,
    "sourceRev" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictionaryEntry_word_idx" ON "DictionaryEntry"("word");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryEntry_word_pos_key" ON "DictionaryEntry"("word", "pos");
