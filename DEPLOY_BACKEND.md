# Deploying the GlightDeck Backend (Railway or Render)

## Why this is needed

Right now only `apps/web` (the Vite frontend) is deployed, as a static site on Vercel. `apps/server` (Express + Prisma + PostgreSQL) has never been deployed anywhere — that's the real reason listening generation (and everything else that hits the API) fails in production: the live frontend is still calling `http://localhost:4000/api`, which resolves to each visitor's own machine, not a real server.

Fixing this requires two things:
1. Deploy `apps/server` as its own web service with a real hosted Postgres database (this guide).
2. Point the Vercel frontend's `VITE_API_URL` at that new backend's public URL and redeploy (last section below).

`apps/server` is self-contained — it lists its own full dependency set in `apps/server/package.json` and doesn't import anything from `apps/web` — so on both platforms you can set the service's root directory directly to `apps/server` and treat it like a standalone app. No workspace-root gymnastics needed.

Relevant facts baked into the steps below, from this repo:
- Build: `tsc -p tsconfig.json` → outputs `dist/index.js`
- Start: `node dist/index.js`
- The server reads `process.env.PORT` (defaults to 4000) and binds to it — compatible with both platforms, which inject their own `PORT`.
- CORS origin comes from `process.env.CLIENT_ORIGIN` (defaults to `http://localhost:5173`) — must be set to your real Vercel URL.
- There's a `GET /health` endpoint returning `{ ok: true }` — useful for platform health checks.
- No Dockerfile exists, so both platforms will build it with their native Node buildpack (Railway Nixpacks / Render's Node environment) — nothing extra to configure there.
- Migrations live in `apps/server/prisma/migrations/`, including the `rename_typing_to_meaning` migration — `prisma migrate deploy` must run against the new database before the app starts.

Pick whichever platform you prefer — the two are equivalent in capability for this app. Cost/limits as of mid-2026, for reference: Railway's free trial is a one-time $5 credit (no card required), after which it drops to $1/month free credit or a $5/month Hobby plan; Render's free tier gives a web service 750 hours/month but it spins down after 15 minutes of inactivity (30–60s cold start on the next request), and free Postgres databases expire 30 days after creation. If you want the listening feature always warm and the database to persist, budget for Railway Hobby ($5/mo) or Render's paid web service + paid Postgres tier.

---

## Option A: Railway

### 1. Create the project and database
1. Go to [railway.com](https://railway.com) and sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → select your GlightDeck repo.
3. Railway will try to auto-detect an app at the repo root — that's fine, you'll redirect it in step 2 below (or you can choose "Empty Service" first and configure it manually).
4. In the same project, click **+ New → Database → Add PostgreSQL**. This provisions a managed Postgres instance and creates a `Postgres` service with its own `DATABASE_URL` variable.

### 2. Configure the server service
Click into the service Railway created for your repo (not the Postgres one) → **Settings**:

- **Root Directory**: `apps/server`
- **Build Command** (override): 
  ```
  npm install && npm run db:generate && npm run build
  ```
- **Start Command** (override):
  ```
  npm run db:deploy && npm run start
  ```
  (`db:deploy` runs `prisma migrate deploy`, so every deploy applies any pending migrations — including the TYPING→MEANING rename — before the server starts serving traffic.)
- **Healthcheck Path** (optional but recommended): `/health`

### 3. Environment variables
Still in that service, go to **Variables** and add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway's variable-reference syntax — type this literally; it links to the Postgres service you just created) |
| `CLERK_SECRET_KEY` | your real Clerk secret key |
| `GEMINI_API_KEY` | a valid key in `AIzaSy...` format (your current key starts with `AQ.`, which is a newer Google credential format that Gemini's API has been rejecting for many accounts — regenerate a standard API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) if generation still fails after deploying) |
| `ANTHROPIC_API_KEY` | if used elsewhere in the server |
| `CLIENT_ORIGIN` | your Vercel frontend URL, e.g. `https://your-app.vercel.app` (no trailing slash) |
| `NODE_ENV` | `production` |

Railway sets `PORT` automatically — you don't need to add it.

### 4. Deploy and get a public URL
1. Trigger a deploy (it should start automatically after saving settings/variables).
2. Watch the build logs; confirm `prisma migrate deploy` reports migrations applied, then `node dist/index.js` logs `GlightDeck API listening on http://localhost:<port>`.
3. Go to **Settings → Networking → Generate Domain** to get a public URL like `https://glightdeck-server-production.up.railway.app`.
4. Sanity check: visit `https://<your-domain>/health` in a browser — you should see `{"ok":true,"service":"glightdeck-api"}`.

---

## Option B: Render

### 1. Create the database
**Using Render's own Postgres:**
1. Go to [render.com](https://render.com) and sign in with GitHub.
2. **New → PostgreSQL**. Name it, pick a region close to where you'll run the web service, choose a plan (free tier works for testing but expires after 30 days).
3. Once created, copy the **Internal Database URL** (use the internal one, not external, since the web service will live in the same Render region/network — it's faster and doesn't count against external bandwidth).

**Using Supabase Postgres instead:** Do **not** use the "Direct connection" string shown by default (`db.<project-ref>.supabase.co:5432`) — that hostname only resolves to an IPv6 address, and Render does not support outbound IPv6, so the connection will time out. In Supabase → **Project Settings → Database → Connection string**, switch to the **Session pooler** tab instead and copy that URI (host looks like `aws-0-<region>.pooler.supabase.com`, port `5432`, username like `postgres.<project-ref>`). That one is IPv4 and works from Render. Replace `[YOUR-PASSWORD]` with your actual database password (the one you set when creating the Supabase project, not your Supabase login password) — if it contains special characters (`@ : / ? #`), URL-encode them.

### 2. Create the web service
1. **New → Web Service** → connect your GlightDeck GitHub repo.
2. **Root Directory**: `apps/server`
3. **Runtime/Environment**: Node
4. **Build Command**:
   ```
   npm install && npm run db:generate && npm run build
   ```
5. **Pre-Deploy Command** (Render has a dedicated field for this — runs after build, before the new instance starts serving, exactly once per deploy):
   ```
   npm run db:deploy
   ```
   If your Render plan/UI doesn't expose a separate Pre-Deploy Command field, fold it into the start command instead: `npm run db:deploy && npm run start`.
6. **Start Command**:
   ```
   npm run start
   ```
7. **Health Check Path**: `/health`

### 3. Environment variables
In the web service's **Environment** tab, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Internal Database URL you copied from the Postgres instance |
| `CLERK_SECRET_KEY` | your real Clerk secret key |
| `GEMINI_API_KEY` | a valid `AIzaSy...`-format key (see note above about the `AQ.` prefix issue) |
| `ANTHROPIC_API_KEY` | if used elsewhere in the server |
| `CLIENT_ORIGIN` | your Vercel frontend URL, e.g. `https://your-app.vercel.app` |
| `NODE_ENV` | `production` |

Render sets `PORT` automatically.

### 4. Deploy
1. Click **Create Web Service** (or **Manual Deploy** if it already exists).
2. Watch the logs for the Pre-Deploy step applying migrations, then the start command logging `GlightDeck API listening on ...`.
3. Your public URL will look like `https://glightdeck-server.onrender.com`. Visit `https://<your-domain>/health` to confirm it responds.
4. Remember: on the free tier this service sleeps after 15 minutes idle — the first request after a sleep will take 30–60 seconds while it wakes up. That will look like a hung "generating..." request the first time someone uses the app after a break. Upgrade off the free plan if that's not acceptable.

---

## Final step (required either way): point the frontend at the new backend

1. In the [Vercel dashboard](https://vercel.com), open the `apps/web` project → **Settings → Environment Variables**.
2. Add or update:
   - `VITE_API_URL` = `https://<your-railway-or-render-domain>/api` (include the `/api` suffix — that's the mount path in `index.ts`)
3. Apply it to the **Production** environment (and Preview, if you want preview deploys to also hit the real backend).
4. Redeploy the frontend (Vercel → Deployments → ⋯ → Redeploy), since `VITE_API_URL` is baked into the build at build time, not read at runtime — an env var change alone does nothing until you rebuild.
5. Update the backend's `CLIENT_ORIGIN` variable (Railway or Render) to match this same Vercel URL exactly, if you haven't already — otherwise the browser will block the API calls with a CORS error.

## After deploying: verify

- Open the live site, try generating a listening exercise. If it still fails, check the backend service's logs (Railway: service → Deployments → View Logs; Render: service → Logs) — the error-handling fix from earlier now logs `err.stack` and returns the real error message in the response note, so the log/response will say exactly what's wrong (bad API key, DB connection issue, etc.) instead of a generic failure.
- If you see a Prisma error like "Query engine not found for this platform," add `binaryTargets = ["native", "debian-openssl-3.0.x"]` to the `generator client` block in `apps/server/prisma/schema.prisma`, commit, and redeploy — both platforms run Debian-based Linux containers, and Prisma occasionally needs the target listed explicitly depending on the base image.
