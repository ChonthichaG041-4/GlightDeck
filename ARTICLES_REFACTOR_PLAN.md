# Articles-Hub IA Refactor — Analysis & Plan

Status: **proposal, no code changed yet.** Written after a full read-only scan of the repo (see file:line references throughout). Confirms feasibility, flags what's new-build vs. rewiring, and lays out a 5-phase rollout.

---

## 1. Current state (confirmed from code)

- **Duplication is real and worse than just UI**: Reading and Listening each have their own `ArticleLibrary`/`ArticleCard` and `ListeningLibrary`/`ListeningArticleCard` (near-identical markup, separately coded delete-confirm dialogs). Reading's Community tab uses a shared `CommunityTab.tsx` component; Listening's Community tab (`ListeningCommunityTab`, `ListeningPage.tsx:221-263`) does **not** reuse it — it's a second, hand-rolled implementation that client-side filters `category === "Listening"`.
- **Reading and Listening are already just two "views" of the same content.** `ArticleReaderPage.tsx` and `ListeningReaderPage.tsx` both call the exact same `usePassage(id)` → `GET /api/reading/passages/:id`. There is no separate "listening article" data shape. `ArticleCard` already has a "Test Listening" button that's just a `<Link to="/listening/:id">` — the app already treats reading/listening as button-driven destinations off one card, not tabs. **This means the core premise of your plan (Articles as hub, Reading/Listening as practice modes) is not a new mental model to build from scratch — it's formalizing a pattern that half-exists already.**
- **There is no article-creation duplication between Reading and Listening** — Listening has no "Create" tab; it only has Generate. The duplication is entirely in the *library/community* layer, not the *creation* layer.
- **A separate, older creation path exists and should be retired**: `AddArticleDialog` (`ReadingPage.tsx:274-310`) + `useCreateArticle()` → `POST /reading/articles` is a legacy "paste your own text" dialog that predates Create Mode. Create Mode's "Create" tab already supports a `PASTE_TEXT` content source doing the same job through the richer composer. This is duplicate article-management surface the user's brief explicitly asks to eliminate.

## 2. Gaps vs. the target spec (what's genuinely new work)

| Spec requirement | Exists today? | What's needed |
|---|---|---|
| Tags filter | Partial — `Article.tags: String[]` already exists (free-text array) | UI only: filter chips in My Articles/Community. No schema change. |
| Search / Sort | Not built | New query params on `GET /reading/articles` (search on title/content, sort by createdAt/viewCount/title) + UI. Small backend change. |
| Draft / Published / Archived | **Does not exist.** Only `visibility` (PRIVATE/PUBLIC/UNLISTED) exists, which is about *who can see it*, not workflow state. | New `ArticleStatus` enum field (`DRAFT \| PUBLISHED \| ARCHIVED`, default `DRAFT`) + migration + backfill. |
| Study Lists | **Does not exist.** The only list-grouping concept in the schema is `Collection`, and it is Word-only (`Collection.words: Word[]`, no relation to `Article`). | New `StudyList` model + `StudyListArticle` join table (many-to-many — an article can sit in multiple lists). Not a reuse of `Collection`; that model's shape (icon/color/wordCount) is vocabulary-specific. |
| Difficulty on Article Detail | Exists — `cefrLevel` string field already doubles as difficulty. | No change, just surface it. |
| Reading time / vocab count / question count | **Not computed or stored anywhere.** | Compute client-side at render time from data `usePassage` already returns (`content.split(/\s+/).length`, `vocabulary?.length`, `questions?.length`). No schema change needed unless you later want these sortable/filterable server-side. |
| "Generate Quiz" action | **Endpoint already exists** — `POST /api/ai/generate-questions-for-passage` (`ai.ts:936`), already has a client hook `useGenerateQuestionsForPassage`. Currently only wired into Create Mode's Question Builder. | Wire existing hook into Article Detail's action button, persist result via existing `useUpdatePassage`. No new AI/backend work. |
| "Extract Vocabulary" action | **Endpoint already exists** — `POST /api/ai/vocabulary-detect` (`ai.ts:864`), hook `useVocabularyDetect` already exists. Currently only wired into Create Mode's Vocabulary panel. | Same as above — wire existing hook + `useUpdatePassage`, no new backend. |
| Duplicate action | Not built | New endpoint `POST /reading/passages/:id/duplicate` (clone content+meta as a new PRIVATE/DRAFT article owned by the caller) + hook. Small, new. |
| Quiz generated from Articles | **Does not exist as a bridge.** `QuizPage.tsx`/`quiz.ts` are 100% Word/Collection-scoped today — no `articleId` param anywhere in that flow. The reading-comprehension questions attached to an Article (`questionsJson`) are a completely separate system from `/quiz`, only ever consumed inside `ReadingWorkspace`/`ListeningWorkspace`. | This is the single biggest net-new feature in the whole brief — not a rename, not a rewire. Recommend scoping it as its own later phase (see Phase 5) rather than blocking the IA cutover on it. |

## 3. Target navigation & routing

```
Home            /
Vocabulary      /vocabulary
Articles        /articles              <- NEW (My Articles + Community tabs)
Reading         /reading                (Generate + Create only, tabs trimmed)
Listening       /listening              (Generate only, tabs trimmed)
Flashcards      /flashcards
Quiz            /quiz
Statistics      /statistics
```

New page-level routes:
- `/articles` → `ArticlesPage.tsx` (My Articles / Community tabs)
- `/articles/:id` → `ArticleDetailPage.tsx` (new — the rich detail view with Start Reading / Start Listening / Generate Quiz / Extract Vocabulary / Edit / Duplicate / Delete)

Unchanged routes (still the right destinations, just reached via buttons from Article Detail instead of tabs/cards):
- `/reading/:id` → `ArticleReaderPage.tsx` ("Start Reading")
- `/listening/:id` → `ListeningReaderPage.tsx` ("Start Listening")
- `/reading/:id/edit` → `ReadingPage.tsx` rendering `CreateModeTab` ("Edit")

`Sidebar.tsx` change is a one-line reorder + one new entry in the `navItems` array (`Sidebar.tsx:7-15`); needs one new icon import (e.g. `Library` or `Newspaper` from `lucide-react`).

## 4. Folder structure

```
apps/web/src/pages/
  ArticlesPage.tsx          NEW  — My Articles + Community tabs
  ArticleDetailPage.tsx     NEW  — detail view + actions
  ArticleReaderPage.tsx     unchanged
  ListeningReaderPage.tsx   unchanged
  ReadingPage.tsx           trimmed to Generate/Create
  ListeningPage.tsx         trimmed to Generate
  ...(Vocabulary/Flashcards/Quiz/Statistics/Home unchanged)

apps/web/src/components/articles/    NEW folder
  ArticleCard.tsx           unifies ArticleCard + ListeningArticleCard
  ArticleList.tsx           unifies ArticleLibrary + ListeningLibrary
  CommunityBrowser.tsx      moved from components/reading/CommunityTab.tsx, replaces ListeningCommunityTab
  ArticleFilters.tsx        NEW (Phase 4) — search/tags/status/sort bar
  StudyListSidebar.tsx      NEW (Phase 4)
  ArticleActionsBar.tsx     NEW (Phase 3) — the action-button row

apps/web/src/components/reading/     shrinks to Generate/Create-only:
  CreateModeTab.tsx, BlockEditor.tsx, QuestionBuilder.tsx, VocabularyPanel.tsx,
  AiAssistantToolbar.tsx, ImportBookWizard.tsx, PassageMetaFields.tsx,
  composerConstants.tsx, primitives.tsx, ReadingWorkspace.tsx (still used by reader pages)
```

## 5. Duplicated UI to remove

1. `ArticleLibrary` + `ArticleCard` (`ReadingPage.tsx:154-272`) and `ListeningLibrary` + `ListeningArticleCard` (`ListeningPage.tsx:131-215`) — replaced by one `ArticleList`/`ArticleCard` in `components/articles/`.
2. `ListeningCommunityTab` (`ListeningPage.tsx:221-263`) — replaced by reusing `CommunityBrowser` (moved `CommunityTab.tsx`).
3. `AddArticleDialog` (`ReadingPage.tsx:274-310`) + `useCreateArticle()` — retire in favor of Create Mode's existing `PASTE_TEXT` content source. (Keep `GET /reading/articles` and `DELETE /reading/articles/:id` — those are still the list/delete endpoints the new Articles hub needs; only the old creation dialog/endpoint pairing is dead weight.)
4. The "My Articles" and "Community" `TabsTrigger`s themselves in both `ReadingPage.tsx` (lines 137-138) and `ListeningPage.tsx` (lines 115-116).

## 6. Data model changes required

Two new Prisma migrations (kept separate so each can be reviewed/tested independently):

**Migration A — `ArticleStatus`**
```prisma
enum ArticleStatus { DRAFT PUBLISHED ARCHIVED }
// Article.status ArticleStatus @default(DRAFT)
```
Backfill rule: existing rows with `visibility: PUBLIC` → `status: PUBLISHED`; everything else → `DRAFT`. `status` and `visibility` stay orthogonal (status = workflow state, visibility = who can see it) — publishing to Community can be UI-gated on `status === PUBLISHED`.

**Migration B — `StudyList`**
```prisma
model StudyList {
  id        String   @id @default(cuid())
  name      String
  userId    String
  user      User     @relation(...)
  articles  StudyListArticle[]
  createdAt DateTime @default(now())
}
model StudyListArticle {
  studyListId String
  articleId   String
  studyList   StudyList @relation(fields: [studyListId], references: [id], onDelete: Cascade)
  article     Article   @relation(fields: [articleId], references: [id], onDelete: Cascade)
  @@id([studyListId, articleId])
}
```

No schema change needed for Tags (already `Article.tags: String[]`) or for reading-time/vocab-count/question-count (computed client-side from data already fetched).

## 7. Open decisions before Phase 4 starts

These are genuine product calls, not implementation details — flagging rather than assuming:

1. Should **Study Lists** be visible/usable from the Article Detail page too (add-to-list from detail view), or only managed from the My Articles list view? (Recommend: both, same as how Vocabulary's Collection picker works today — consistent pattern.)
2. Should **Archived** articles still be usable for Reading/Listening/Quiz (just hidden from the default My Articles view), or fully locked? (Recommend: still usable, just filtered out by default — matches how "archive" behaves in most apps.)
3. Is **Quiz-from-Article** (row 10 in the gap table) in scope for this refactor, or a separate follow-up project? It's the one item here that's a genuine new feature, not a rewire — recommend treating it as Phase 5 / optionally its own task afterward so it doesn't block shipping the navigation cutover.

## 8. Phased implementation plan

**Phase 1 — Shell (additive only, nothing removed yet)**
Add `/articles` + `/articles/:id` routes, `ArticlesPage.tsx` + `ArticleDetailPage.tsx`, sidebar entry/reorder. Initially these can wrap the *existing* `ArticleLibrary`/`CommunityTab` logic (moved, not yet rewritten) so the new page works immediately. Reading/Listening keep their own tabs for now — nothing breaks, both paths work in parallel. Testable independently: visit `/articles`, confirm it lists your articles and community content correctly, before touching Reading/Listening at all.

**Phase 2 — Consolidate & cut over**
Build the unified `ArticleCard`/`ArticleList`/`CommunityBrowser` in `components/articles/`. Point `ArticlesPage.tsx` at them. Remove the "My Articles"/"Community" tabs from `ReadingPage.tsx` and `ListeningPage.tsx`. Delete `ArticleLibrary`, `ArticleCard`, `ListeningLibrary`, `ListeningArticleCard`, `ListeningCommunityTab`, `AddArticleDialog`/`useCreateArticle`. Testable independently: confirm Reading/Listening now only show Generate(/Create), confirm nothing in `/articles` regressed.

**Phase 3 — Article Detail richness**
Build the full action bar (Start Reading, Start Listening, Generate Quiz, Extract Vocabulary, Edit, Duplicate, Delete) and metadata display (difficulty, computed reading time, vocab/question counts, tags, visibility). Add the `duplicate` endpoint + hook. Wire Generate Quiz / Extract Vocabulary to the *already-existing* AI endpoints. Testable independently per action button.

**Phase 4 — Study Lists, status, search/filter/sort**
Run Migration A + B. Build filter/search/sort bar and Study List management UI in `ArticlesPage.tsx`. Add Categories/Difficulty/Popularity/Latest/Tags filters to `CommunityBrowser` (Community keeps Category as its own axis per your spec, unlike My Articles which drops Category in favor of Study Lists/Tags).

**Phase 5 — Quiz/Vocabulary bridges (net-new feature, not a rewire)**
Add an `articleId`-aware entry point to Quiz (generate from an article's `questionsJson`, generating on the fly via the existing endpoint if the article has none yet). This is the one piece of the brief that's genuinely new functionality rather than reorganization — sizing it separately keeps Phases 1-4 (the actual IA fix) shippable and testable on their own.

---

Each phase above is scoped to be its own small, independently testable commit, per your instruction. Ready to start Phase 1 on confirmation.
