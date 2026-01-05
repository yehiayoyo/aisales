import express, { type Express, type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth/index.js";
import { registerSocialRoutes } from "./routes/social.js";
import { registerMessagingRoutes } from "./routes/messaging.js";
import { registerAIRoutes } from "./routes/ai.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { webhookRouter } from "./routes/webhooks.js";
import { registerUGCRoutes } from "./routes/ugc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = 5000;

app.use(cors());
app.use("/webhooks", webhookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

async function startServer() {
  await setupAuth(app);
  registerAuthRoutes(app);
  
  registerSocialRoutes(app);
  registerMessagingRoutes(app);
  registerAIRoutes(app);
  registerDashboardRoutes(app);
  registerUGCRoutes(app);

  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok", service: "MT Hub" });
  });

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.get("/dashboard", isAuthenticated, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/dashboard.html"));
  });

  app.get("/ugc", isAuthenticated, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/ugc.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MT Hub running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
