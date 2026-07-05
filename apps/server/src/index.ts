import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { withClerk } from "./middleware/auth";
import apiRouter from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 4000;
const allowedOrigins = [
  "http://localhost:5173",
  "https://glight-deck-qytn5ophy-portfolio-chonthicha-leepreecha.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
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
