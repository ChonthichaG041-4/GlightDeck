// One-off script to fix User rows whose `email` column ended up as an
// auto-generated placeholder (`<clerkId>@placeholder.glightdeck.app`)
// instead of the account's real email address.
//
// Why this happened: the lazy user-creation path in middleware/auth.ts used
// to read the email off the Clerk session JWT's claims (req.auth.sessionClaims),
// but Clerk does NOT include the email address there by default - that needs
// a custom session token template configured in the Clerk dashboard. So that
// lookup was silently undefined for essentially every account, and the
// placeholder fallback kicked in every time. auth.ts now fetches the real
// email from Clerk's Backend API on first login instead (see that file), but
// that only fixes brand-new users going forward - this script backfills any
// account that was already created with a placeholder before that fix.
//
// Usage:
//   cd apps/server
//   npx tsx scripts/backfill-user-emails.ts --dry-run
//   npx tsx scripts/backfill-user-emails.ts
//
// Defaults to process.env.DATABASE_URL (whatever's in your apps/server/.env,
// i.e. your local DB) - pass --database-url to point it at production
// instead (run it once per environment; a placeholder in your local DB and
// one in production are two separate rows that both need fixing). Requires
// CLERK_SECRET_KEY to already be set in your .env (same key used everywhere
// else in this app) since it calls Clerk's Backend API to look up each
// user's real email by their clerkId.
//
// Options:
//   --database-url <url>   DB to fix (default: process.env.DATABASE_URL)
//   --dry-run               print what would change, write nothing

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { clerkClient } from "@clerk/express";

const PLACEHOLDER_SUFFIX = "@placeholder.glightdeck.app";

interface Args {
  databaseUrl?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--database-url") args.databaseUrl = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = args.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("No database URL - pass --database-url <url> or set DATABASE_URL.");
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.error("Missing CLERK_SECRET_KEY - needed to look up real emails via Clerk's Backend API.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    const placeholderUsers = await prisma.user.findMany({
      where: { email: { endsWith: PLACEHOLDER_SUFFIX } },
    });

    if (!placeholderUsers.length) {
      console.log("No placeholder-email users found - nothing to do.");
      return;
    }

    console.log(
      `Found ${placeholderUsers.length} user(s) with a placeholder email${
        args.dryRun ? " (dry run - nothing will be written)" : ""
      }...\n`
    );

    let fixed = 0;
    let skipped = 0;
    for (const user of placeholderUsers) {
      try {
        const clerkUser = await clerkClient.users.getUser(user.clerkId);
        const realEmail = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
        if (!realEmail) {
          console.log(`  SKIP  ${user.clerkId} - Clerk has no email on file for this account either.`);
          skipped++;
          continue;
        }

        const conflict = await prisma.user.findUnique({ where: { email: realEmail } });
        if (conflict && conflict.id !== user.id) {
          console.log(
            `  SKIP  ${user.clerkId} - another User row (${conflict.id}) already has "${realEmail}" ` +
              `(email is unique) - resolve this manually.`
          );
          skipped++;
          continue;
        }

        if (args.dryRun) {
          console.log(`  WOULD FIX  ${user.clerkId}: "${user.email}" -> "${realEmail}"`);
        } else {
          await prisma.user.update({ where: { id: user.id }, data: { email: realEmail } });
          console.log(`  FIXED  ${user.clerkId}: "${user.email}" -> "${realEmail}"`);
        }
        fixed++;
      } catch (err: any) {
        console.log(`  SKIP  ${user.clerkId} - lookup/update failed: ${err?.message ?? err}`);
        skipped++;
      }
    }

    console.log(`\nDone. ${fixed} ${args.dryRun ? "would be fixed" : "fixed"}, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
