-- Rename the "Typing" quiz type to "Meaning" throughout.
-- Postgres supports renaming an enum value in place (since PG 10), so existing
-- QuizAttempt rows referencing the old "TYPING" value are preserved automatically
-- and now read as "MEANING" - no data migration/backfill needed.
ALTER TYPE "QuizType" RENAME VALUE 'TYPING' TO 'MEANING';

-- Rename the matching DailyProgress columns to keep terminology consistent.
ALTER TABLE "DailyProgress" RENAME COLUMN "typingCount" TO "meaningCount";
ALTER TABLE "DailyProgress" RENAME COLUMN "typingTarget" TO "meaningTarget";
