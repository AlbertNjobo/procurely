import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { chunkTextSmart, generateEmbeddings, generateQueryEmbedding, rerankResults } from "../lib/rag";
import { insertChunks, searchChunks as zvecSearch } from "../lib/zvec-store";

export function registerKbRoutes(app: Router) {
  // Embed document chunks and store in Zvec
  app.post("/api/kb/embed", requireAuth, async (req, res) => {
    const { docId, title, content, category } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });

    try {
      const isPolicy = (category || "").toLowerCase() === "policy";
      const chunks = chunkTextSmart(content, isPolicy);
      if (chunks.length === 0) return res.json({ chunks: [], count: 0 });

      const embeddings = await generateEmbeddings(chunks);

      insertChunks(chunks.map((text, i) => ({
        docId, title, text, embedding: embeddings[i],
      })));

      res.json({ count: chunks.length });
    } catch (error: any) {
      console.error("Embedding error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Semantic search across embedded knowledge base chunks (via Zvec)
  app.post("/api/kb/search", requireAuth, async (req, res) => {
    const { query, topK } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
      const queryEmbedding = await generateQueryEmbedding(query);
      let results = zvecSearch(queryEmbedding, topK || 8);

      if (results.length > 1) {
        results = await rerankResults(query, results, topK || 5);
      }

      res.json({ results: results.map(r => ({ text: r.text, docId: r.docId, title: r.title, score: r.score })) });
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
