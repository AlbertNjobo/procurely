import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import "dotenv/config";
import { initZvecStore } from "./src/lib/zvec-store";
import { requireAuth } from "./src/lib/auth-middleware";
import { registerEmailRoutes } from "./src/routes/email";
import { registerWorkflowRoutes } from "./src/routes/workflows";
import { registerMemoryRoutes } from "./src/routes/memory";
import { registerKbRoutes } from "./src/routes/kb";
import { registerDocumentRoutes } from "./src/routes/documents";
import { registerAgentRoutes } from "./src/routes/agent";

const app = express();
const PORT = 3000;
app.use(express.json());

// Initialize Qwen via DashScope compatible mode
let openai: OpenAI | null = null;
try {
  if (process.env.QWEN_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.QWEN_API_KEY,
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      defaultHeaders: { "x-dashscope-session-cache": "enable" },
    });
  }
} catch (error) {
  console.warn("Could not initialize Qwen API", error);
}

// Initialize Zvec vector store
initZvecStore();

// Health check (public)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Register all route modules
const getOpenAI = () => openai;
registerEmailRoutes(app);
registerWorkflowRoutes(app);
registerMemoryRoutes(app, getOpenAI);
registerKbRoutes(app);
registerDocumentRoutes(app, getOpenAI);
registerAgentRoutes(app, getOpenAI);

// Vite dev / production static
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
