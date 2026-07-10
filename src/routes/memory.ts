import { Router } from "express";
import OpenAI from "openai";
import { requireAuth } from "../lib/auth-middleware";
import { generateQueryEmbedding } from "../lib/rag";
import { insertMemory, searchMemories } from "../lib/zvec-store";

export function registerMemoryRoutes(app: Router, getOpenAI: () => OpenAI | null) {
  // Store a memory entry (in Zvec for vector search)
  app.post("/api/memory/store", requireAuth, async (req, res) => {
    try {
      const { userId, type, content, metadata } = req.body;
      if (!userId || !content) {
        return res.status(400).json({ error: "userId and content are required" });
      }

      let embedding: number[] = [];
      try {
        embedding = await generateQueryEmbedding(content);
      } catch (e) {
        console.warn("Failed to embed memory, storing without embedding:", e);
      }

      const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      insertMemory({
        id: memoryId,
        userId,
        type: type || "general",
        content,
        metadata: metadata || {},
        embedding,
      });

      res.json({
        success: true,
        entry: { id: memoryId, userId, type: type || "general", content, metadata: metadata || {}, embedding, createdAt: new Date().toISOString() }
      });
    } catch (error: any) {
      console.error("Memory store error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search memories by semantic similarity (via Zvec)
  app.post("/api/memory/search", requireAuth, async (req, res) => {
    try {
      const { userId, query, topK, memoryType } = req.body;
      if (!userId || !query) {
        return res.status(400).json({ error: "userId and query are required" });
      }

      const queryEmbedding = await generateQueryEmbedding(query);
      const results = searchMemories(userId, queryEmbedding, topK || 5, memoryType);

      res.json({ results: results.map((m: any) => ({
        type: m.type, content: m.content, metadata: m.metadata, score: m.score,
      }))});
    } catch (error: any) {
      console.error("Memory search error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Summarize a conversation into memory entries
  app.post("/api/memory/summarize", requireAuth, async (req, res) => {
    try {
      const { messages, userId } = req.body;
      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "messages are required" });
      }
      const openai = getOpenAI();
      if (!openai) {
        return res.status(500).json({ error: "Qwen client not initialized" });
      }

      const conversationText = messages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => `${m.role}: ${m.content || m.parts?.[0]?.text || ""}`)
        .join("\n");

      const response = await openai.chat.completions.create({
        model: "qwen3.6-flash",
        messages: [{
          role: "user",
          content: `Extract key facts and user preferences from this procurement conversation. Return a JSON array of memory entries.\n\nEach entry should have:\n- type: "preference" | "decision" | "fact" | "pattern"\n- content: A concise sentence capturing the insight\n- metadata: Relevant context (department, category, etc.)\n\nConversation:\n${conversationText.substring(0, 4000)}\n\nReturn ONLY a JSON array, no other text. Example:\n[{"type":"preference","content":"User prefers Dell laptops for engineering","metadata":{"department":"Engineering","category":"Hardware"}}]`
        }],
        temperature: 0.1,
      });

      let memories = [];
      try {
        const content = response.choices[0]?.message?.content || "[]";
        memories = JSON.parse(content.replace(/```json/g, "").replace(/```/g, "").trim());
      } catch (e) {
        console.error("Failed to parse memory summary:", e);
      }

      res.json({ memories, userId });
    } catch (error: any) {
      console.error("Memory summarize error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
