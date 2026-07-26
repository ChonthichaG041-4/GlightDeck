-- Vocabulary page filters by level/type/favorite (scoped to the current
-- user) with no supporting index, forcing a full per-user table scan on
-- every filtered query. Add the missing composite indexes.

-- CreateIndex
CREATE INDEX "Word_userId_level_idx" ON "Word"("userId", "level");

-- CreateIndex
CREATE INDEX "Word_userId_type_idx" ON "Word"("userId", "type");

-- CreateIndex
CREATE INDEX "Word_userId_favorite_idx" ON "Word"("userId", "favorite");
