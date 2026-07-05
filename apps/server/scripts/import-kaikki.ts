// One-time (or periodic) offline import of Kaikki.org's Wiktionary extract
// into the DictionaryEntry table, which powers the Reading Workspace's
// double-click dictionary popup with real IPA/audio/synonyms/antonyms and
// genuine Thai translations (so the popup doesn't depend entirely on Gemini).
//
// This is NOT meant to run inside the app's request/response cycle, and it is
// NOT meant to run in a sandboxed/CI environment - the source file is ~2.9GB
// and a full import can take a long while (see README "Dictionary import"
// section for expected time/storage). Run it once from your own machine (or
// a one-off job on your host) against the production DATABASE_URL, e.g.:
//
//   cd apps/server
//   DATABASE_URL="postgresql://..." npx tsx scripts/import-kaikki.ts
//
// Useful flags for a quick dry run before committing to the full 2.9GB pass:
//   npx tsx scripts/import-kaikki.ts --limit 5000
//
// Options:
//   --file <path>      read from a local JSONL file instead of downloading
//   --url <url>        override the download URL (default: kaikki.org's English dump)
//   --limit <n>        stop after this many *matching* (en, non-redirect) lines
//   --langs th,ja,...  translation language codes to keep (always includes "th")
//   --include-names    also import proper-noun entries (pos === "name") - skipped by
//                       default since they rarely help a reading-passage dictionary
//                       lookup and would roughly double the table size
//   --batch-size <n>   rows merged into a single upsert statement (default 2000)

import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db";

const DEFAULT_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl";

interface Args {
  file?: string;
  url: string;
  limit?: number;
  langs: Set<string>;
  includeNames: boolean;
  batchSize: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { url: DEFAULT_URL, langs: new Set(["th"]), includeNames: false, batchSize: 2000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") args.file = argv[++i];
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--langs") argv[++i].split(",").map((s) => s.trim()).filter(Boolean).forEach((l) => args.langs.add(l));
    else if (a === "--include-names") args.includeNames = true;
    else if (a === "--batch-size") args.batchSize = Number(argv[++i]);
  }
  return args;
}

// ---- wiktextract JSONL shapes (only the fields we use; see
// https://github.com/tatuylonen/wiktextract/blob/master/README.md) ----
interface KaikkiLinkage {
  word?: string;
}
interface KaikkiTranslation {
  code?: string; // 2-3 letter Wiktionary language code, e.g. "th"
  word?: string;
}
interface KaikkiExample {
  text?: string;
}
interface KaikkiSense {
  glosses?: string[];
  tags?: string[];
  examples?: KaikkiExample[];
  translations?: KaikkiTranslation[];
  synonyms?: KaikkiLinkage[];
  antonyms?: KaikkiLinkage[];
}
interface KaikkiSound {
  ipa?: string;
  audio?: string;
  ogg_url?: string;
  mp3_url?: string;
}
interface KaikkiEntry {
  word?: string;
  pos?: string;
  lang_code?: string;
  redirect?: string; // present on redirect "entries" - not real words, skip
  senses?: KaikkiSense[];
  sounds?: KaikkiSound[];
  translations?: KaikkiTranslation[];
  synonyms?: KaikkiLinkage[];
  antonyms?: KaikkiLinkage[];
}

// The row shape we accumulate per (word, pos) within a batch before upserting.
interface Row {
  word: string;
  pos: string;
  ipa: string | null;
  audioUrl: string | null;
  senses: { gloss: string; examples: string[]; tags: string[] }[];
  synonyms: string[];
  antonyms: string[];
  translations: { lang: string; word: string }[];
}

function pickIpa(sounds?: KaikkiSound[]): string | null {
  return sounds?.find((s) => s.ipa)?.ipa ?? null;
}
function pickAudioUrl(sounds?: KaikkiSound[]): string | null {
  const withAudio = sounds?.find((s) => s.mp3_url || s.ogg_url);
  return withAudio?.mp3_url ?? withAudio?.ogg_url ?? null;
}

function extractTranslations(entry: KaikkiEntry, langs: Set<string>): { lang: string; word: string }[] {
  const out: { lang: string; word: string }[] = [];
  const collect = (list?: KaikkiTranslation[]) => {
    for (const t of list ?? []) {
      if (t.code && langs.has(t.code) && t.word) out.push({ lang: t.code, word: t.word });
    }
  };
  collect(entry.translations);
  for (const sense of entry.senses ?? []) collect(sense.translations);
  return out;
}

function extractLinkages(entryLevel: KaikkiLinkage[] | undefined, senses: KaikkiSense[] | undefined, key: "synonyms" | "antonyms"): string[] {
  const words = new Set<string>();
  for (const l of entryLevel ?? []) if (l.word) words.add(l.word);
  for (const s of senses ?? []) for (const l of s[key] ?? []) if (l.word) words.add(l.word);
  return Array.from(words).slice(0, 10);
}

function toRow(entry: KaikkiEntry): Row | null {
  if (!entry.word || !entry.pos || entry.redirect) return null;
  const senses = (entry.senses ?? [])
    .filter((s) => s.glosses?.length)
    .map((s) => ({
      gloss: s.glosses!.join("; "),
      examples: (s.examples ?? []).map((e) => e.text).filter((t): t is string => !!t).slice(0, 2),
      tags: s.tags ?? [],
    }));
  if (!senses.length) return null;

  return {
    word: entry.word.toLowerCase(),
    pos: entry.pos,
    ipa: pickIpa(entry.sounds),
    audioUrl: pickAudioUrl(entry.sounds),
    senses,
    synonyms: extractLinkages(entry.synonyms, entry.senses, "synonyms"),
    antonyms: extractLinkages(entry.antonyms, entry.senses, "antonyms"),
    translations: [],
  };
}

/** Merge two rows for the same (word, pos) seen within one in-memory batch. */
function mergeRows(a: Row, b: Row): Row {
  return {
    word: a.word,
    pos: a.pos,
    ipa: a.ipa ?? b.ipa,
    audioUrl: a.audioUrl ?? b.audioUrl,
    senses: [...a.senses, ...b.senses],
    synonyms: Array.from(new Set([...a.synonyms, ...b.synonyms])).slice(0, 10),
    antonyms: Array.from(new Set([...a.antonyms, ...b.antonyms])).slice(0, 10),
    translations: [...a.translations, ...b.translations],
  };
}

async function flushBatch(rows: Row[], sourceRev: string) {
  if (!rows.length) return;
  const cols = 10;
  const values: string[] = [];
  const params: any[] = [];
  rows.forEach((r, i) => {
    const base = i * cols;
    values.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6}::jsonb,$${base + 7}::text[],$${base + 8}::text[],$${base + 9}::jsonb,$${base + 10},now(),now())`
    );
    params.push(
      randomUUID(),
      r.word,
      r.pos,
      r.ipa,
      r.audioUrl,
      JSON.stringify(r.senses),
      r.synonyms,
      r.antonyms,
      JSON.stringify(r.translations),
      sourceRev
    );
  });

  const sql = `
    INSERT INTO "DictionaryEntry" (id, word, pos, ipa, "audioUrl", senses, synonyms, antonyms, translations, "sourceRev", "createdAt", "updatedAt")
    VALUES ${values.join(",")}
    ON CONFLICT (word, pos) DO UPDATE SET
      senses = "DictionaryEntry".senses || EXCLUDED.senses,
      synonyms = (SELECT array_agg(DISTINCT x) FROM unnest("DictionaryEntry".synonyms || EXCLUDED.synonyms) AS x),
      antonyms = (SELECT array_agg(DISTINCT x) FROM unnest("DictionaryEntry".antonyms || EXCLUDED.antonyms) AS x),
      translations = "DictionaryEntry".translations || EXCLUDED.translations,
      ipa = COALESCE("DictionaryEntry".ipa, EXCLUDED.ipa),
      "audioUrl" = COALESCE("DictionaryEntry"."audioUrl", EXCLUDED."audioUrl"),
      "updatedAt" = now();
  `;
  await prisma.$executeRawUnsafe(sql, ...params);
}

async function openLineStream(args: Args): Promise<NodeJS.ReadableStream> {
  if (args.file) {
    const fs = await import("node:fs");
    return fs.createReadStream(args.file, { encoding: "utf-8" });
  }
  console.log(`Downloading ${args.url} (this is ~2.9GB - streamed, not saved to disk) ...`);
  const res = await fetch(args.url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  return Readable.fromWeb(res.body as any);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRev = new Date().toISOString().slice(0, 10);

  const stream = await openLineStream(args);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let batch = new Map<string, Row>();
  let linesSeen = 0;
  let matched = 0;
  let skippedNames = 0;
  const startedAt = Date.now();

  for await (const line of rl) {
    linesSeen++;
    if (!line.trim()) continue;

    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // malformed line - skip rather than crash a multi-hour job
    }

    if (entry.lang_code !== "en") continue;
    if (!args.includeNames && entry.pos === "name") {
      skippedNames++;
      continue;
    }

    const row = toRow(entry);
    if (!row) continue;
    row.translations = extractTranslations(entry, args.langs);

    const key = `${row.word} ${row.pos}`;
    const existing = batch.get(key);
    batch.set(key, existing ? mergeRows(existing, row) : row);
    matched++;

    if (linesSeen % 200000 === 0) {
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(`... ${linesSeen} lines read, ${matched} matched, ${skippedNames} names skipped (${mins} min elapsed)`);
    }

    if (batch.size >= args.batchSize) {
      await flushBatch(Array.from(batch.values()), sourceRev);
      batch = new Map();
    }

    if (args.limit && matched >= args.limit) break;
  }

  if (batch.size) await flushBatch(Array.from(batch.values()), sourceRev);

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`Done. ${linesSeen} lines read, ${matched} matched entries imported/updated, ${skippedNames} proper-noun entries skipped, ${mins} min total.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Kaikki import failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
