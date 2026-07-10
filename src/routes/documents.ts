import { Router } from "express";
import OpenAI from "openai";
import { requireAuth } from "../lib/auth-middleware";

export function registerDocumentRoutes(app: Router, getOpenAI: () => OpenAI | null) {
  app.post("/api/documents/classify", requireAuth, async (req, res) => {
    const { text, fileName } = req.body;
    const openai = getOpenAI();
    if (!openai) {
      return res.status(500).json({ error: "OpenAI client not initialized" });
    }

    try {
      const prompt = `You are an automated document classifier and summarizer for a procurement system.
Task 1: Classify the following document into exactly one of these categories: 'Policy', 'Contract', 'Quote', 'Invoice', 'Guideline', or 'Other'.
Task 2: Generate a concise bulleted summary of the key points in the document.

File Name: ${fileName}

Document snippet (first 3000 characters):
${text.substring(0, 3000)}

Respond in valid JSON format with the following keys:
{
  "category": "String (one of the allowed categories)",
  "summary": "String (Markdown bullet points)"
}`;

      const response = await openai.chat.completions.create({
        model: "qwen3.5-plus-2026-02-15",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "document_classification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["Policy", "Contract", "Quote", "Invoice", "Guideline", "Other"],
                  description: "The document category"
                },
                summary: {
                  type: "string",
                  description: "A concise bulleted summary of the key points"
                }
              },
              required: ["category", "summary"]
            }
          }
        }
      });

      let resultObj: { category?: string, summary?: string } = {};
      try {
        const content = response.choices[0]?.message?.content?.trim() || "{}";
        resultObj = JSON.parse(content);
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
      }

      let category = resultObj.category || "Other";
      const summary = resultObj.summary || "- No summary generated.";

      const validCategories = ["Policy", "Contract", "Quote", "Invoice", "Guideline", "Other"];
      if (!validCategories.includes(category)) {
        category = "Other";
      }

      res.json({ category, summary });
    } catch (error: any) {
      console.error("Classification error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
