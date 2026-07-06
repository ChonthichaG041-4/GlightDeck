# GlightDeck - Personal Vocabulary Learning System

A personal English learning hub: your own vocabulary bank, Anki-style spaced
repetition flashcards, listening & dictation drills, article reading with
click-to-add vocabulary, five quiz formats, statistics, and an AI assistant
for explaining words and idioms.

## Tech stack

- **Frontend**: React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui-style components, React Router, TanStack Query, Recharts, Clerk (auth)
- **Backend**: Express + TypeScript, Prisma ORM, PostgreSQL, Clerk (auth middleware)
- **Audio**: Web Speech API (browser TTS) - no external audio files required
- **AI Assistant**: Anthropic API (optional - falls back to an offline placeholder if no key is set)

## Project structure

```
GlightDeck/
├── apps/
│   ├── web/        React + Vite frontend (port 5173)
│   └── server/     Express + Prisma API (port 4000)
├── docker-compose.yml   Local PostgreSQL
└── package.json         npm workspaces root
```

## 1. Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL) - or your own Postgres instance
- A free [Clerk](https://dashboard.clerk.com) account (for authentication)
- (Optional) An [Anthropic API key](https://console.anthropic.com) for the AI Assistant

## 2. Install dependencies

```bash
npm install
```

This installs both `apps/web` and `apps/server` via npm workspaces.

## 3. Configure environment variables

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

Fill in:

- `apps/server/.env`
  - `DATABASE_URL` - defaults to the docker-compose Postgres below
  - `CLERK_SECRET_KEY` - from your Clerk dashboard
  - `ANTHROPIC_API_KEY` - optional, enables the real AI Assistant
- `apps/web/.env`
  - `VITE_CLERK_PUBLISHABLE_KEY` - from your Clerk dashboard (must match the same Clerk app as the secret key)
  - `VITE_API_URL` - defaults to `http://localhost:4000/api`

## 4. Start PostgreSQL

```bash
docker compose up -d
```

## 5. Set up the database

```bash
npm run db:migrate   # creates tables from prisma/schema.prisma
npm run db:seed      # seeds demo words, collections, tags, achievements
```

> Note: `prisma generate`/`migrate` download small platform-specific engine
> binaries from Prisma's CDN on first run. Run this step on your own machine
> (not inside a network-restricted sandbox) so that download can succeed.

## 6. Run the app

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000 (health check at `/health`)

Sign up / sign in via Clerk on first load - your local `User` row is created
automatically on your first authenticated API call.

## Updating an existing local setup

If you already had the app running before, the schema changed (multi-language
translations + a `sourceLang` field on `Word`). Pull the latest files, then:

```bash
npm run db:migrate
```

Prisma will create a migration for the new `WordTranslation` table - no data
is lost.

## Dictionary data (Kaikki.org import)

The Reading Workspace's double-click dictionary popup is powered by three
layered sources, so real dictionary data always wins over AI: **Kaikki.org**
(a Wiktionary extract - real IPA, real pronunciation audio, real
synonyms/antonyms, and genuine Thai translations) first, then the free
**Free Dictionary API** (`api.dictionaryapi.dev`, live, no key) if a word
isn't in the Kaikki table, then **Gemini** to fill in whatever neither of
those has (CEFR level, frequency rating, word family, example translation).

The Free Dictionary API and Gemini need no setup beyond `GEMINI_API_KEY`
(already required elsewhere). The Kaikki layer is **optional** - the popup
works fine without it, just relying more on Gemini - but importing it gives
noticeably better results (real audio, real Thai translations). To set it up:

```bash
cd apps/server
npx prisma migrate deploy   # creates the DictionaryEntry table, if not already applied
npm run db:import-kaikki    # or: npx tsx scripts/import-kaikki.ts
```

Things to know before running the full import:

- **Source**: streams `kaikki.org-dictionary-English.jsonl` directly from
  kaikki.org (~2.9GB) - nothing is saved to disk, but it does take a while
  (well over an hour on a typical connection) and needs a real, non-sandboxed
  network connection.
- **Database storage**: expect roughly 1-2GB added to your Postgres database
  once imported. Check your hosting plan's storage limit before running this
  against a production database.
- **Run it against `DATABASE_URL`** for whichever environment you want the
  data in - locally, or against your deployed Railway/Render Postgres
  instance (set `DATABASE_URL` in the shell before running the command).
- **Dry run first**: `npx tsx scripts/import-kaikki.ts --limit 5000` processes
  only the first 5,000 matching entries, so you can confirm it's working
  before committing to the full pass.
- It's safe to re-run (upserts by word+part-of-speech), so you can re-import
  later to pick up a newer Wiktionary dump.

## Features

- **Vocabulary**: personal dictionary with search, level (A1-C2), type, status and favorite filters; each word stores meaning, IPA, example + translation, synonym/opposite, frequency, and custom tags/collections
- **Flashcards**: Anki-style spaced repetition (SM-2) with Again/Hard/Good/Easy grading; a "Smart Review" panel resurfaces words you keep getting wrong (4+ lapses)
- **Listening**: multiple-choice and dictation modes using the browser's built-in text-to-speech
- **Reading**: save articles by category (novels, game articles, news...) and tap any word while reading to see its meaning (via the AI assistant) and add it straight to your vocabulary
- **Quiz**: multiple choice, matching, typing, sentence fill-in-the-blank, and listening quiz formats, all generated from your own word bank
- **Statistics**: words learned/mastered/learning/forgotten, accuracy, streaks, and charts (Recharts)
- **Collections & Tags**: organize words into custom decks (e.g. Fantasy, Business, Travel) and custom tags (e.g. IELTS, TOEIC, Anime)
- **Word relationships**: mindmap-style synonym chains (e.g. happy → joy → cheerful → delighted → ecstatic)
- **Bookmarked sentences**, **Daily Challenge** progress, and **Achievements** (streak/word-count badges)
- **Import**: paste a word list or upload a CSV/TXT file to bulk-create flashcards
- **AI Assistant**: ask "Explain 'Take off'" and get meaning / example / usage / contrast
- **Multi-language auto-suggest**: when adding a word, pick a source language and one or more target languages - typing the word and hitting "Auto-suggest" fills in IPA, part of speech, CEFR level, and a translation per target language (via the same `ANTHROPIC_API_KEY`); every suggested field stays editable before saving
- **Collections as study groups**: filter Vocabulary by collection, or jump straight into Flashcards / Listening / Quiz scoped to just that one group instead of your whole deck

## Deployment

- **Frontend** → [Vercel](https://vercel.com): set the root directory to `apps/web`, add the `VITE_*` env vars, build command `npm run build`, output directory `dist`.
- **Backend + database** → [Railway](https://railway.app) or [Render](https://render.com): deploy `apps/server` as a Node service (`npm run build` then `npm start`), add a managed PostgreSQL instance, set the server env vars, and run `npx prisma migrate deploy` once against the production database.
- Set `CLIENT_ORIGIN` on the server to your deployed frontend URL, and `VITE_API_URL` on the frontend to your deployed API URL.

## Scripts (root)

| Command | Description |
|---|---|
| `npm run dev` | Run frontend + backend together |
| `npm run build` | Build both apps for production |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |
| `npm --workspace apps/server run db:import-kaikki` | Import Kaikki.org dictionary data (see "Dictionary data" above) |
