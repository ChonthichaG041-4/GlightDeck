-- Reading Workspace's "Save Vocabulary" dialog adds a personal-note field per word
-- (e.g. "this comes up a lot in TOEIC").

-- AlterTable
ALTER TABLE "Word" ADD COLUMN "note" TEXT;
