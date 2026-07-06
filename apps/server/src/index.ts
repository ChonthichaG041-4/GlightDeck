import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { withClerk } from "./middleware/auth";
import apiRouter from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 4000;

// CLIENT_ORIGIN can be a single URL or a comma-separated list (e.g. your stable
// production domain plus any custom domains). Any Vercel preview deployment
// (https://<project>-<hash>-<team>.vercel.app) is allowed automatically below,
// since Vercel mints a brand-new hash on every preview deploy - hardcoding one
// specific preview URL here would only work until the next deploy.
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin, curl, server-to-server
      if (allowedOrigins.includes(origin)) return callback(null, true);
      try {
        if (/\.vercel\.app$/i.test(new URL(origin).hostname)) return callback(null, true);
      } catch {
        // fall through to rejection below
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(withClerk);

app.get("/health", (_req, res) => res.json({ ok: true, service: "glightdeck-api" }));

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`GlightDeck API listening on http://localhost:${PORT}`);
});
