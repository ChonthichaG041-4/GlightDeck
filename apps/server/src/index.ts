import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { withClerk } from "./middleware/auth";
import apiRouter from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(withClerk);

app.get("/health", (_req, res) => res.json({ ok: true, service: "lingodeck-api" }));

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`LingoDeck API listening on http://localhost:${PORT}`);
});
