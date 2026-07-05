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
  .map((o) => o.trim