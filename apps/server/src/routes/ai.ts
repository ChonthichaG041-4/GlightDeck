import { Router } from "express";
import { z } from "zod";

const router = Router();

const explainInput = z.object({
  text: z.string().min(1),
});

/**
 * POST /api/ai/explain { text: "Take off" }
 * Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise returns a
 * clearly-labelled offline placeholder so the UI keeps working in local dev.
 */
router.post("/explain", async (req, res) => {
  const { text } = explainInput.parse(req.body);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.json({
      source: "offline",
      meaning: `(Set ANTHROPIC_API_KEY to get a real explanation) "${text}" — add your API key in apps/server/.env.`,
      example: "-",
      usage: "-",
      contrast: "-",
    });
  }

  try {
    const prompt = `Explain the English word or phrase "${text}" for a Thai learner. Reply strictly as JSON with keys: meaning (Thai), example (English sentence), usage (when to use it, in Thai), contrast (how it differs from a commonly confused word, in Thai).`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data: any = await response.json();
    const raw = data?.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    res.json({ source: "ai", ...parsed });
  } catch (err) {
    console.error("AI explain failed", err);
    res.status(502).json({ error: "AI assistant is temporarily unavailable" });
  }
});

export default router;
