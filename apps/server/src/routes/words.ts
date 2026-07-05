import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";
import { isLeech } from "../lib/srs";

const router = Router();

const wordInput = z.object({
  headword: z.string().min(1),
  sourceLang: z.string().default("en"),
  meaning: z.string().min(1),
  ipa: z.string().optional(),
  type: z.enum([
    "NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG",
    "PHRASE", "PREPOSITION", "CONJUNCTION", "PRONOUN", "OTHER",
  ]).default("OTHER"),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).default("A1"),
  example: z.string().optional(),
  exampleTranslate: z.string().optional(),
  synonym: z.string().optional(),
  opposite: z.string().optional(),
  frequency: z.number().int().min(1).max(5).default(3),
  image: z.string().optional(),
  audioUrl: z.string().optional(),
  note: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  translations: z.record(z.string(), z.string()).optional(), // { th: "...", ja: "..." }
});

// GET /api/words?search=&level=&type=&status=&tag=&collectionId=&favorite=
router.get("/", async (req, res) => {
  const user = getDbUser(req);
  const { search, level, type, status, tag, collectionId, favorite } = req.query as Record<string, string>;
  // collectionId=ALL (or omitted) means "every collection"

  const where: any = { userId: user.id };
  if (search) {
    where.OR = [
      { headword: { contains: search, mode: "insensitive" } },
      { meaning: { contains: search, mode: "insensitive" } },
      { example: { contains: search, mode: "insensitive" } },
    ];
  }
  if (level) where.level = level;
  if (type) where.type = type;
  if (status) where.status = status;
  if (collectionId) where.collectionId = collectionId;
  if (favorite === "true") where.favorite = true;
  if (tag) where.tags = { some: { tag: { name: tag } } };

  const words = await prisma.word.findMany({
    where,
    include: { tags: { include: { tag: true } }, collection: true, translations: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(words.map(serializeWord));
});

router.get("/leeches", async (req, res) => {
  const user = getDbUser(req);
  const words = await prisma.word.findMany({
    where: { userId: user.id, lapses: { gte: 4 } },
    orderBy: { lapses: "desc" },
    take: 10,
  });
  res.json(words.map(serializeWord));
});

router.get("/:id", async (req, res) => {
  const user = getDbUser(req);
  const word = await prisma.word.findFirst({
    where: { id: req.params.id, userId: user.id },
    include: {
      tags: { include: { tag: true } },
      collection: true,
      translations: true,
      relationsFrom: { include: { to: true } },
      relationsTo: { include: { from: true } },
    },
  });
  if (!word) return res.status(404).json({ error: "Word not found" });
  res.json(serializeWord(word));
});

router.post("/", async (req, res) => {
  const user = getDbUser(req);
  const data = wordInput.parse(req.body);
  const { tagIds, translations, ...rest } = data;

  const translationEntries = Object.entries(translations ?? {}).filter(([, text]) => text?.trim());

  const word = await prisma.word.create({
    data: {
      ...rest,
      userId: user.id,
      tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      translations: translationEntries.length
        ? { create: translationEntries.map(([lang, text]) => ({ lang, text })) }
        : undefined,
    },
    include: { tags: { include: { tag: true } }, collection: true, translations: true },
  });
  res.status(201).json(serializeWord(word));
});

const bulkInput = z.object({
  sourceLang: z.string().default("en"),
  collectionId: z.string().optional(), // add into this existing collection
  newCollectionName: z.string().optional(), // or create a brand-new collection with this name
  words: z.array(z.object({
    headword: z.string().min(1),
    ipa: z.string().optional().nullable(),
    type: z.enum([
      "NOUN", "VERB", "ADJECTIVE", "ADVERB", "IDIOM", "SLANG",
      "PHRASE", "PREPOSITION", "CONJUNCTION", "PRONOUN", "OTHER",
    ]).default("OTHER"),
    level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).default("A1"),
    example: z.string().optional().nullable(),
    translations: z.record(z.string(), z.string()).optional(),
  })).min(1),
});

// POST /api/words/bulk { sourceLang, collectionId?, newCollectionName?, words: [...] }
// Saves a whole reviewed batch at once - used by the AI "generate vocabulary set" flow
// (Vocabulary page -> "AI generate word set"), optionally creating a brand-new Collection first.
router.post("/bulk", async (req, res) => {
  const user = getDbUser(req);
  const { sourceLang, collectionId, newCollectionName, words } = bulkInput.parse(req.body);

  let finalCollectionId: string | null = collectionId || null;
  if (newCollectionName?.trim()) {
    const collection = await prisma.collection.create({
      data: { name: newCollectionName.trim(), userId: user.id },
    });
    finalCollectionId = collection.id;
  }

  const created = await prisma.$transaction(
    words.map((w) => {
      const translationEntries = Object.entries(w.translations ?? {}).filter(([, text]) => text?.trim());
      const primaryMeaning = translationEntries[0]?.[1] ?? "";
      return prisma.word.create({
        data: {
          headword: w.headword,
          sourceLang,
          meaning: primaryMeaning,
          ipa: w.ipa ?? undefined,
          type: w.type,
          level: w.level,
          example: w.example ?? undefined,
          userId: user.id,
          collectionId: finalCollectionId ?? undefined,
          translations: translationEntries.length
            ? { create: translationEntries.map(([lang, text]) => ({ lang, text })) }
            : undefined,
        },
      });
    })
  );

  res.status(201).json({ imported: created.length, collectionId: finalCollectionId });
});

router.patch("/:id", async (req, res) => {
  const user = getDbUser(req);
  const data = wordInput.partial().parse(req.body);
  const { tagIds, translations, ...rest } = data;

  const existing = await prisma.word.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Word not found" });

  if (tagIds) {
    await prisma.wordTag.deleteMany({ where: { wordId: req.params.id } });
  }

  if (translations) {
    for (const [lang, text] of Object.entries(translations)) {
      if (!text?.trim()) continue;
      await prisma.wordTranslation.upsert({
        where: { wordId_lang: { wordId: req.params.id, lang } },
        update: { text },
        create: { wordId: req.params.id, lang, text },
      });
    }
  }

  const word = await prisma.word.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: { tags: { include: { tag: true } }, collection: true, translations: true },
  });
  res.json(serializeWord(word));
});

router.patch("/:id/favorite", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.word.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Word not found" });

  const word = await prisma.word.update({
    where: { id: req.params.id },
    data: { favorite: !existing.favorite },
  });
  res.json(serializeWord(word));
});

router.delete("/:id", async (req, res) => {
  const user = getDbUser(req);
  const existing = await prisma.word.findFirst({ where: { id: req.params.id, userId: user.id } });
  if (!existing) return res.status(404).json({ error: "Word not found" });

  await prisma.word.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export function serializeWord(word: any) {
  return {
    ...word,
    tags: word.tags?.map((wt: any) => wt.tag) ?? [],
    isLeech: isLeech(word.lap