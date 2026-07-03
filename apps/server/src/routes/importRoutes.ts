import { Router } from "express";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../db";
import { getDbUser } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const bodySchema = z.object({
  collectionId: z.string().optional(),
});

/**
 * POST /api/import/file  (multipart/form-data: file, collectionId?)
 * Accepts .csv (headword,meaning,ipa,type,level,example,...) or .txt
 * (one headword per line - cards are auto-generated with blank fields to fill in later).
 */
router.post("/file", upload.single("file"), async (req, res) => {
  const user = getDbUser(req);
  const { collectionId } = bodySchema.parse(req.body);
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const text = req.file.buffer.toString("utf-8");
  const isCsv = req.file.originalname.toLowerCase().endsWith(".csv");

  let rows: Record<string, string>[] = [];

  if (isCsv) {
    rows = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true });
  } else {
    rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((headword) => ({ headword }));
  }

  const created = await prisma.$transaction(
    rows
      .filter((r) => r.headword)
      .map((r) =>
        prisma.word.create({
          data: {
            headword: r.headword,
            meaning: r.meaning ?? "",
            ipa: r.ipa,
            example: r.example,
            level: (r.level as any) ?? "A1",
            type: (r.type as any) ?? "OTHER",
            userId: user.id,
            collectionId: collectionId || undefined,
          },
        })
      )
  );

  res.status(201).json({ imported: created.length });
});

// POST /api/import/paste { text: "apple\norange\nbanana", collectionId? }
router.post("/paste", async (req, res) => {
  const user = getDbUser(req);
  const schema = z.object({ text: z.string().min(1), collectionId: z.string().optional() });
  const { text, collectionId } = schema.parse(req.body);

  const words = text
    .split(/\r?\n|,/)
    .map((w) => w.trim())
    .filter(Boolean);

  const created = await prisma.$transaction(
    words.map((headword) =>
      prisma.word.create({
        data: { headword, meaning: "", userId: user.id, collectionId: collectionId || undefined },
      })
    )
  );

  res.status(201).json({ imported: created.length });
});

export default router;
