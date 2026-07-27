// One-off utility to copy a user's Article rows from one database to
// another - written specifically to move locally-created test/demo articles
// (e.g. the OCR-imported "Reading Exercise 1-6" set) onto the deployed
// production database, since local dev and production intentionally use
// separate Postgres instances (see README/DEPLOY_BACKEND.md) and a Prisma
// migration only ever syncs table *structure*, never row data, between them.
//
// Deliberately NOT wired into the app or any npm-lifecycle script - run it
// by hand, once, whenever you actually want to push a batch of articles
// across environments:
//
//   cd apps/server
//   npx tsx scripts/migrate-articles.ts \
//     --source "postgresql://postgres:postgres@localhost:5433/glightdeck" \
//     --target "postgresql://<production connection string>" \
//     --email "you@example.com"
//
// Add --dry-run first to preview exactly what would be copied/skipped
// without writing anything - strongly recommended before pointing this at a
// real production database.
//
// What it does NOT do (on purpose, to stay safe/simple):
//   - Never deletes or overwrites anything on the target - articles whose
//     title already exists for the target user are skipped, not replaced.
//   - Never copies highlights/notes/likes/ratings/attempts - those are
//     personal, session-specific annotations tied to a particular user in a
//     particular environment; copying them across would be meaningless (and
//     the target user has no local highlights to preserve/merge anyway).
//   - Never copies the pre-generated Listening audio URLs (audioUrl,
//     articleAudioUrl, questionsAudioUrl, choicesAudioUrl,
//     instructionAudioUrl, questionAudioUrls) - those point at MP3 files
//     cached on the *source* server's disk, which don't exist on the
//     target's disk. Left null so the target just regenerates them on first
//     Listening play, exactly like any other never-cached article.
//
// Options:
//   --source <url>       source DATABASE_URL (default: process.env.DATABASE_URL,
//                         i.e. whatever's in apps/server/.env - your local DB)
//   --target <url>       target DATABASE_URL (required - e.g. production)
//   --email <email>      source AND target user's email (must already exist
//                         in both databases - this script never creates users)
//   --source-email <e>   overrides --email for the source lookup only
//   --target-email <e>   overrides --email for the target lookup only
//   --only-public        only copy articles with visibility = PUBLIC
//                         (default: copy everything the user owns, keeping
//                         each article's own visibility/status as-is)
//   --dry-run            print what would happen, write nothing

import { PrismaClient } from "@prisma/client";

interface Args {
  source?: string;
  target?: string;
  sourceEmail?: string;
  targetEmail?: string;
  onlyPublic: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { onlyPublic: false, dryRun: false };
  let email: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") args.source = argv[++i];
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--email") email = argv[++i];
    else if (a === "--source-email") args.sourceEmail = argv[++i];
    else if (a === "--target-email") args.targetEmail = argv[++i];
    else if (a === "--only-public") args.onlyPublic = true;
    else if (a === "--dry-run") args.dryRun = true;
  }
  args.sourceEmail ??= email;
  args.targetEmail ??= email;
  return args;
}

// Fields that are meaningful to carry over as-is. Explicitly excludes id,
// userId, viewCount (resets to 0 - organic per-environment stat) and every
// pre-generated audio URL field (see header comment).
const COPY_FIELDS = [
  "title", "category", "content", "source", "createdAt",
  "translation", "questionsJson", "examMode", "cefrLevel", "testMode",
  "visibility", "status",
  "description", "tags", "contentSource", "blocksJson", "vocabularyMode", "vocabularyJson",
] as const;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const sourceUrl = args.source ?? process.env.DATABASE_URL;
  if (!sourceUrl) {
    console.error("No source DB - pass --source <url> or set DATABASE_URL.");
    process.exit(1);
  }
  if (!args.target) {
    console.error("Missing --target <production DATABASE_URL>.");
    process.exit(1);
  }
  if (!args.sourceEmail || !args.targetEmail) {
    console.error("Missing --email (or --source-email/--target-email) - which user's articles to copy.");
    process.exit(1);
  }

  const src = new PrismaClient({ datasourceUrl: sourceUrl });
  const dst = new PrismaClient({ datasourceUrl: args.target });

  try {
    const sourceUser = await src.user.findUnique({ where: { email: args.sourceEmail } });
    if (!sourceUser) {
      console.error(`No user with email "${args.sourceEmail}" found in the source database.`);
      process.exit(1);
    }
    const targetUser = await dst.user.findUnique({ where: { email: args.targetEmail } });
    if (!targetUser) {
      console.error(
        `No user with email "${args.targetEmail}" found in the target database. ` +
          `Log into the target site at least once first (so Clerk/your app creates the User row), then re-run this script.`
      );
      process.exit(1);
    }

    const articles = await src.article.findMany({
      where: { userId: sourceUser.id, ...(args.onlyPublic ? { visibility: "PUBLIC" as const } : {}) },
      orderBy: { createdAt: "asc" },
    });

    if (!articles.length) {
      console.log("Nothing to copy - source user has no matching articles.");
      return;
    }

    console.log(
      `Found ${articles.length} article(s) for ${args.sourceEmail} in source. Copying to ${args.targetEmail} in target${
        args.dryRun ? " (dry run - nothing will be written)" : ""
      }...\n`
    );

    let copied = 0;
    let skipped = 0;
    for (const a of articles) {
      const exists = await dst.article.findFirst({ where: { userId: targetUser.id, title: a.title } });
      if (exists) {
        console.log(`  SKIP  "${a.title}" - target user already has an article with this title.`);
        skipped++;
        continue;
      }

      const data: Record<string, unknown> = { userId: targetUser.id };
      for (const field of COPY_FIELDS) data[field] = (a as Record<string, unknown>)[field];

      if (args.dryRun) {
        console.log(`  WOULD COPY  "${a.title}" (${a.visibility}/${a.status})`);
      } else {
        await dst.article.create({ data: data as any });
        console.log(`  COPIED  "${a.title}" (${a.visibility}/${a.status})`);
      }
      copied++;
    }

    console.log(`\nDone. ${copied} ${args.dryRun ? "would be copied" : "copied"}, ${skipped} skipped (already existed).`);
    if (!args.dryRun && copied) {
      console.log(
        "Note: Listening audio for these articles will regenerate on first play on the target " +
          "(pre-generated audio URLs were intentionally not copied - see script header)."
      );
    }
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
