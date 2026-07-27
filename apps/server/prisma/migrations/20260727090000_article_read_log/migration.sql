-- Dedup marker so "articles read today" only counts each distinct article
-- once per (user, day), regardless of how many times /mark-read or /attempt
-- fires for it (repeat page views, StrictMode's dev double-invoke, retries).
CREATE TABLE "ArticleReadLog" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleReadLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleReadLog_userId_articleId_date_key" ON "ArticleReadLog"("userId", "articleId", "date");

ALTER TABLE "ArticleReadLog" ADD CONSTRAINT "ArticleReadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleReadLog" ADD CONSTRAINT "ArticleReadLog_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
