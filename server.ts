import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import "dotenv/config";
import { agentTools } from "./src/lib/agent-tools";
import { chunkText, generateEmbeddings, generateQueryEmbedding, searchChunks, rerankResults } from "./src/lib/rag";

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
      defaultHeaders: {
        "x-dashscope-session-cache": "enable",
      },
    });
  }
} catch (error) {
  console.warn("Could not initialize Qwen API", error);
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ============================================================================
// Agent Memory Endpoints
// Cross-session memory for the procurement agent
// ============================================================================

// Store a memory entry
app.post("/api/memory/store", async (req, res) => {
  try {
    const { userId, type, content, metadata } = req.body;
    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content are required" });
    }

    // Generate embedding for semantic search later
    let embedding: number[] = [];
    try {
      const embeddingResponse = await generateQueryEmbedding(content);
      embedding = embeddingResponse;
    } catch (e) {
      console.warn("Failed to embed memory, storing without embedding:", e);
    }

    const memoryEntry = {
      userId,
      type: type || "general",
      content,
      metadata: metadata || {},
      embedding,
      createdAt: new Date().toISOString(),
    };

    res.json({ success: true, entry: memoryEntry });
  } catch (error: any) {
    console.error("Memory store error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Search memories by semantic similarity
app.post("/api/memory/search", async (req, res) => {
  try {
    const { userId, query, memories, topK } = req.body;
    if (!userId || !query) {
      return res.status(400).json({ error: "userId and query are required" });
    }

    if (!memories || memories.length === 0) {
      return res.json({ results: [] });
    }

    // Embed the query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Calculate cosine similarity against stored memories
    const scored = memories
      .filter((m: any) => m.embedding && m.embedding.length > 0)
      .map((m: any) => ({
        ...m,
        score: cosineSimilarityLocal(queryEmbedding, m.embedding),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, topK || 5);

    res.json({ results: scored.map((m: any) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      metadata: m.metadata,
      score: m.score,
      createdAt: m.createdAt,
    }))});
  } catch (error: any) {
    console.error("Memory search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Summarize a conversation into memory entries
app.post("/api/memory/summarize", async (req, res) => {
  try {
    const { messages, userId } = req.body;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "messages are required" });
    }
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
        content: `Extract key facts and user preferences from this procurement conversation. Return a JSON array of memory entries.

Each entry should have:
- type: "preference" | "decision" | "fact" | "pattern"
- content: A concise sentence capturing the insight
- metadata: Relevant context (department, category, etc.)

Conversation:
${conversationText.substring(0, 4000)}

Return ONLY a JSON array, no other text. Example:
[{"type":"preference","content":"User prefers Dell laptops for engineering","metadata":{"department":"Engineering","category":"Hardware"}}]`
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

// Local cosine similarity (same as in rag.ts but self-contained for memory)
function cosineSimilarityLocal(a: number[], b: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// RAG: Embed document chunks and store in request body (caller saves to Firestore)
app.post("/api/kb/embed", async (req, res) => {
  const { docId, title, content } = req.body;
  if (!content) return res.status(400).json({ error: "Content is required" });

  try {
    const chunks = chunkText(content, 500, 100);
    if (chunks.length === 0) return res.json({ chunks: [], embeddings: [] });

    const embeddings = await generateEmbeddings(chunks);

    const chunkData = chunks.map((text, i) => ({
      docId,
      title,
      text,
      embedding: embeddings[i],
    }));

    res.json({ chunks: chunkData, count: chunks.length });
  } catch (error: any) {
    console.error("Embedding error:", error);
    res.status(500).json({ error: error.message });
  }
});

// RAG: Semantic search across embedded knowledge base chunks
app.post("/api/kb/search", async (req, res) => {
  const { query, chunks, topK } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });
  if (!chunks || chunks.length === 0) return res.json({ results: [] });

  try {
    const queryEmbedding = await generateQueryEmbedding(query);
    let results = searchChunks(queryEmbedding, chunks, topK || 8);

    // Rerank with qwen3-rerank for better precision
    if (results.length > 1) {
      results = await rerankResults(query, results, topK || 5);
    }

    res.json({ results: results.map(r => ({ text: r.text, docId: r.docId, title: r.title, score: r.score })) });
  } catch (error: any) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// AI Document Classification API
app.post("/api/documents/classify", async (req, res) => {
  const { text, fileName } = req.body;
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
      model: "qwen3.7-plus",
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

    const validCategories = ['Policy', 'Contract', 'Quote', 'Invoice', 'Guideline', 'Other'];
    if (!validCategories.includes(category)) {
      category = 'Other';
    }

    res.json({ category, summary });
  } catch (error: any) {
    console.error("Classification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Qwen Responses API (for native Web Extractor, Image Search, etc.)
app.post("/api/agent/responses", async (req, res) => {
  const { input, tools } = req.body;
  
  if (!process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "sk-...") {
    return res.status(500).json({ error: "QWEN_API_KEY is missing or invalid. Please update it in the Secrets panel." });
  }

  try {
    const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.QWEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3.7-plus", // qwen3.7-plus supports responses API
        input: input, // Responses API expects 'input' string or structured message array
        tools: tools || [
          { type: "web_search" },
          { type: "web_extractor" }
        ],
        // enable_thinking: true // Optional thinking mode
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen Responses API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    res.json({ data });
  } catch (error: any) {
    console.error("AI Responses API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Qwen Autopilot Agent interaction
app.post("/api/agent/transcribe", async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: "OpenAI client not initialized" });
  }

  try {
    const { audioData, format } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: "Audio data is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "qwen3.5-omni-flash",
      messages: [
        { role: "system", content: "Transcribe the following audio exactly as spoken. Output only the transcription text. Ignore non-speech sounds. Respond ONLY with the transcript text, no markdown, no other text." },
        { role: "user", content: [
          { type: "input_audio", input_audio: { data: audioData, format: format || "wav" } }
        ] }
      ]
    });
    
    res.json({ text: completion.choices[0].message.content });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe audio" });
  }
});

app.post("/api/agent/chat", async (req, res) => {
  const { messages, context } = req.body;
  if (!process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "sk-...") {
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");
    res.write(JSON.stringify({ type: "error", error: "QWEN_API_KEY is missing or invalid. Please update it in the Secrets panel." }) + "\n");
    return res.end();
  }
  
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    // Map the messages to the OpenAI compatible format if they aren't already
    const formattedMessages = messages.map((m: any) => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.parts ? m.parts[0].text : m.content,
    }));

    let kbText = "";
    // Use RAG search if embedded chunks are available, otherwise fall back to raw content
    if (context?.kbChunks && context.kbChunks.length > 0) {
      try {
        const lastUserMessage = formattedMessages.filter((m: any) => m.role === 'user').pop();
        const queryText = lastUserMessage?.content || "";
        if (queryText) {
          const searchResponse = await fetch(`http://localhost:${PORT}/api/kb/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queryText, chunks: context.kbChunks, topK: 5 })
          });
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.results && searchData.results.length > 0) {
              kbText = "\n\n=== RELEVANT KNOWLEDGE BASE (RAG) ===\nThe following information is semantically relevant to the user's query:\n";
              searchData.results.forEach((r: any) => {
                kbText += `\n[${r.title}] (relevance: ${(r.score * 100).toFixed(0)}%):\n${r.text}\n---\n`;
              });
            }
          }
        }
      } catch (e) {
        console.error("RAG search failed, falling back:", e);
      }
    } else if (context?.knowledgeBase && context.knowledgeBase.length > 0) {
      // Fallback: raw KB injection for backward compatibility
      kbText = "\n\n=== PROCUREMENT KNOWLEDGE BASE ===\nThe following information is available in the knowledge base and should be used to answer user queries:\n";
      context.knowledgeBase.forEach((doc: any) => {
        kbText += `\nTitle: ${doc.title}\nCategory: ${doc.category || 'N/A'}\nContent:\n${doc.content}\n---\n`;
      });
    }

    // Build memory context string
    let memoryText = "";
    if (context?.agentMemory && context.agentMemory.length > 0) {
      memoryText = "\n\n=== AGENT MEMORY (Past Interactions) ===\nThe following facts have been remembered from previous sessions:\n";
      context.agentMemory.slice(0, 10).forEach((m: any) => {
        memoryText += `\n- [${m.type}] ${m.content}${m.metadata ? ` (${JSON.stringify(m.metadata)})` : ""}`;
      });
      memoryText += "\n\nUse this memory to personalize responses. If the user asks something you already know from memory, reference it directly.";
    }

    // Inject system instruction for the Autopilot Agent
    if (formattedMessages[0]?.role !== 'system') {
      formattedMessages.unshift({
        role: "system",
        content: [
          {
            type: "text",
            text: `You are Atlas, an AI Autopilot Procurement Agent powered by Qwen Cloud. 
You help users with Intake Management, Supplier Management, Risk and Compliance, and full Procure-to-Pay workflows.
Be professional, structured, and helpful. You analyze supplier forms and generate bid matrix analysis when requested.

CAPABILITIES:
- Search the web for products, suppliers, and pricing information
- Analyze supplier risk using real-time web research
- Generate comparative bid matrices
- Process invoices using OCR
- Delegate complex tasks to specialist sub-agents
- Remember user preferences across sessions via agent memory

CRITICAL WORKFLOW FOR PRODUCT RECOMMENDATIONS (e.g. Laptops, Hardware):
PHASE 1 - QUALIFYING: If the user asks for a product but hasn't specified exact requirements, DO NOT search for images or use the form tool yet. Instead, ask 2-3 conversational questions (like ChatGPT does) to narrow down their needs (e.g., "What is your budget?", "Do you prefer a 14-inch or 16-inch screen?", "What will you be using it for?"). Wait for their reply.
PHASE 2 - RECOMMENDATION: Once you have their criteria, search the web to find 2-3 SPECIFIC product models (e.g., "HP EliteBook 845 G11"). Recommend them to the user. Use the \`suggest_procurement_items\` tool to present these specific models as selection cards. You MUST wait for them to choose one.
PHASE 3 - INTAKE FORM: Only AFTER the user has explicitly selected a specific product model, you should proceed to gather the administrative details (department, budget, justification) using the \`ask_form_questions\` tool.

END-TO-END PROCUREMENT WORKFLOW:
When a user wants to procure something, you can autonomously handle the full cycle:
1. Research suppliers and products (web search)
2. Create RFQs and send to suppliers
3. Analyze bids and select the best option
4. Create purchase orders
5. Track deliveries
6. Process invoices and payments
Always use request_approval before irreversible actions.

MULTI-AGENT DELEGATION:
For complex analysis, delegate to specialist sub-agents:
- risk_analyst: Deep supplier risk assessment
- bid_optimizer: Comparative bid analysis and scoring
- compliance_checker: Policy and regulation validation

IMPORTANT: NEVER combine Qualifying, Recommending, and Intake Form phases. You MUST STOP and wait for the user's response between stages.${memoryText}${kbText}`,
            cache_control: { type: "ephemeral" }
          }
        ]
      });
    } else {
      formattedMessages[0].content += memoryText + kbText;
    }

    const toolCallsMade: any[] = [];
    let currentMessages = [...formattedMessages];
    let finalContent = "";

    // Loop for tool calling (max 3 times)
    for (let i = 0; i < 3; i++) {
      if (!openai) {
        throw new Error("OpenAI client not initialized.");
      }

      finalContent = "";
      const toolCallsAccumulator: Record<number, any> = {};

      const stream = await openai.chat.completions.create({
        model: "qwen3.7-plus",
        messages: currentMessages,
        tools: agentTools as any,
        stream: true,
        stream_options: { include_usage: true },
        extra_body: {
          enable_search: true,
          enable_thinking: true,
          thinking_budget: 2048,
          preserve_thinking: true,
          search_options: {
            search_strategy: "agent"
          }
        }
      } as any) as any;

      for await (const chunk of stream) {
        if (chunk.choices && chunk.choices.length > 0) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if ((delta as any).reasoning_content) {
          res.write(JSON.stringify({ type: "reasoning_delta", delta: (delta as any).reasoning_content }) + "\n");
        }
        if (delta.content) {
          finalContent += delta.content;
          res.write(JSON.stringify({ type: "content_delta", delta: delta.content }) + "\n");
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            if (!toolCallsAccumulator[index]) {
              toolCallsAccumulator[index] = {
                id: tc.id,
                name: tc.function?.name,
                arguments: ""
              };
            }
            if (tc.function?.arguments) {
              toolCallsAccumulator[index].arguments += tc.function.arguments;
            }
          }
        }
        } else if (chunk.usage) {
          res.write(JSON.stringify({ type: "usage", usage: chunk.usage }) + "\n");
          console.log(`Tokens used: ${chunk.usage.total_tokens}`);
          if (chunk.usage.prompt_tokens_details?.cached_tokens) {
            console.log(`Cached tokens: ${chunk.usage.prompt_tokens_details.cached_tokens}`);
          }
        }
      }

      const toolCalls = Object.values(toolCallsAccumulator);

      if (toolCalls.length > 0) {
        // Append the assistant's message with tool calls
        currentMessages.push({
          role: "assistant",
          content: finalContent || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))
        });

        // Execute tools
        for (const tc of toolCalls) {
          const args = tc.arguments ? JSON.parse(tc.arguments) : {};
          
          // Send start event
          res.write(JSON.stringify({ type: "tool_start", name: tc.name, arguments: args }) + "\n");
          
          // Artificial delay to show off the loading animation
          await new Promise(r => setTimeout(r, 1200));

          let result = "";

          // Mock executions for the hackathon UI
          if (tc.name === 'get_intake_requests') {
            const allIntakes = context?.intakes || [];
            let filtered = allIntakes;
            if (args.status) filtered = filtered.filter((i: any) => i.status === args.status);
            if (args.department) filtered = filtered.filter((i: any) => i.department === args.department);
            result = JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No requests found matching criteria." }]);
          } else if (tc.name === 'search_procurement_catalog') {
            const catalog = context?.procurementCatalog || [];
            const query = (args.query || '').toLowerCase();
            const filtered = catalog.filter((item: any) => 
              (item.name || '').toLowerCase().includes(query) || 
              (item.category || '').toLowerCase().includes(query) ||
              (item.description || '').toLowerCase().includes(query)
            );
            result = JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No catalog items found matching query." }]);
          } else if (tc.name === 'get_suppliers') {
            // Query Firestore for real suppliers with optional filters
            const allSuppliers = context?.suppliers || [];
            let filtered = allSuppliers;
            if (args.category) filtered = filtered.filter((s: any) => (s.category || '').toLowerCase().includes(args.category.toLowerCase()));
            if (args.risk_level) filtered = filtered.filter((s: any) => (s.risk || '').toLowerCase() === args.risk_level.toLowerCase());
            result = JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No suppliers found matching criteria." }]);
          } else if (tc.name === 'evaluate_supplier_risk') {
            // Use Qwen with web search for real supplier risk assessment
            try {
              const supplier = (context?.suppliers || []).find((s: any) => s.id === args.supplier_id) || { name: args.supplier_id, category: 'Unknown' };
              const riskResponse = await openai!.chat.completions.create({
                model: "qwen3.7-plus",
                messages: [{
                  role: "user",
                  content: `You are a procurement risk analyst. Evaluate the following supplier and provide a risk assessment.

Supplier: ${supplier.name}
Category: ${supplier.category || 'Unknown'}
Supplier ID: ${args.supplier_id}

Research this company using web search if available. Provide:
1. A risk score from 0-100 (where 0 is lowest risk)
2. Overall status: "Passed", "Warning", or "Failed"
3. A list of checks performed (e.g., "Financial Stability", "Security Compliance", "Market Reputation")
4. A brief risk summary

Respond in valid JSON with keys: risk_score, status, checks (array of strings), risk_summary`
                }],
                temperature: 0.2,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);
              const riskContent = riskResponse.choices[0]?.message?.content || '{}';
              const riskData = JSON.parse(riskContent.replace(/```json/g, '').replace(/```/g, '').trim());
              result = JSON.stringify({
                supplier_id: args.supplier_id,
                supplier_name: supplier.name,
                risk_score: riskData.risk_score ?? 50,
                status: riskData.status ?? 'Warning',
                checks: riskData.checks ?? ['Financial', 'Security', 'Compliance'],
                risk_summary: riskData.risk_summary ?? 'Risk assessment completed via Qwen AI analysis.'
              });
            } catch (e) {
              console.error("Supplier risk evaluation error:", e);
              result = JSON.stringify({ supplier_id: args.supplier_id, risk_score: 50, status: 'Warning', checks: ['Financial', 'Security'], risk_summary: 'Automated assessment - review recommended.' });
            }
          } else if (tc.name === 'generate_bid_matrix') {
            // Use Qwen to generate real bid matrix analysis
            try {
              const suppliers = (context?.suppliers || []).filter((s: any) => args.supplier_ids?.includes(s.id));
              const intake = (context?.intakes || []).find((i: any) => i.id === args.intake_id) || { title: 'Unknown', amount: 'N/A', description: 'N/A' };
              const bidResponse = await openai!.chat.completions.create({
                model: "qwen3.7-plus",
                messages: [{
                  role: "user",
                  content: `You are a procurement bid analyst. Generate a comparative bid matrix analysis.

Requisition: ${intake.title} (${intake.amount})
Description: ${intake.description}

Suppliers to compare:
${suppliers.map((s: any) => `- ${s.name} (Category: ${s.category}, Risk: ${s.risk}, Status: ${s.status})`).join('\n') || 'No supplier data available'}

Analyze each supplier across these dimensions:
1. Price competitiveness
2. Risk level
3. Compliance status
4. Category fit
5. Overall recommendation

Provide a structured analysis with:
- A comparison table (JSON array of objects with supplier_name, score, strengths, weaknesses)
- A winning supplier recommendation with reasoning
- A risk-adjusted score for each supplier

Respond in valid JSON with keys: comparison (array), winning_supplier, reasoning, risk_adjusted_scores`
                }],
                temperature: 0.2,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);
              const bidContent = bidResponse.choices[0]?.message?.content || '{}';
              const bidData = JSON.parse(bidContent.replace(/```json/g, '').replace(/```/g, '').trim());
              result = JSON.stringify({
                status: 'Bid Matrix Generated Successfully',
                intake_id: args.intake_id,
                comparison: bidData.comparison || [],
                winning_supplier: bidData.winning_supplier || args.supplier_ids?.[0],
                reasoning: bidData.reasoning || 'Analysis completed via Qwen AI.',
                risk_adjusted_scores: bidData.risk_adjusted_scores || {}
              });
            } catch (e) {
              console.error("Bid matrix generation error:", e);
              result = JSON.stringify({ status: 'Matrix Generated (Basic)', winning_supplier: args.supplier_ids?.[0], reasoning: 'Basic analysis - detailed review recommended.' });
            }
          } else if (tc.name === 'update_intake_status') {
            result = JSON.stringify({ success: true, new_status: args.new_status });
          } else if (tc.name === 'suggest_procurement_items') {
            try {
              const populatedItems = await Promise.all((args.items || []).map(async (item: any) => {
                let imageUrl = `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(item.name)}`;
                try {
                  const qwenResponse = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${process.env.QWEN_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "qwen3.7-plus",
                      input: `Find product images for: ${item.image_query}`,
                      tools: [{ type: "web_search_image" }]
                    })
                  });
                  
                  if (qwenResponse.ok) {
                    const data = await qwenResponse.json();
                    if (data.output && Array.isArray(data.output)) {
                      for (const out of data.output) {
                        if (out.type === "web_search_image_call" && out.output) {
                          const parsedImages = JSON.parse(out.output);
                          if (parsedImages && parsedImages.length > 0) {
                            imageUrl = parsedImages[0].url;
                            break;
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error("Failed to fetch image for item", item.name, e);
                }
                
                return { ...item, image_url: imageUrl };
              }));
              
              result = JSON.stringify({ items: populatedItems });
            } catch (err) {
              console.error("Suggest items error:", err);
              result = JSON.stringify({ items: args.items });
            }
          } else if (tc.name === 'search_product_images') {
            try {
              const qwenResponse = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${process.env.QWEN_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "qwen3.7-plus",
                  input: `Find product images for: ${args.query}`,
                  tools: [{ type: "web_search_image" }]
                })
              });
              
              if (qwenResponse.ok) {
                const data = await qwenResponse.json();
                let foundImages = [];
                if (data.output && Array.isArray(data.output)) {
                  for (const item of data.output) {
                    if (item.type === "web_search_image_call" && item.output) {
                      const parsedImages = JSON.parse(item.output);
                      foundImages = foundImages.concat(parsedImages);
                    }
                  }
                }
                
                // Return up to 4 images to keep the UI clean
                result = JSON.stringify({
                  images: foundImages.slice(0, 4).map((img: any) => ({
                    url: img.url,
                    title: img.title || args.query
                  }))
                });
              } else {
                throw new Error("Failed to fetch from Responses API");
              }
            } catch (err) {
              console.error("Image search error:", err);
              // Fallback to placeholders if the API fails
              result = JSON.stringify({
                images: [
                  { url: `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(args.query)}+1`, title: `${args.query} Option 1` },
                  { url: `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(args.query)}+2`, title: `${args.query} Option 2` }
                ]
              });
            }
          } else if (tc.name === 'request_approval') {
            // HITL: Return approval request - agent must pause and wait
            result = JSON.stringify({
              status: "approval_required",
              action: args.action,
              details: args.details,
              risk_level: args.risk_level,
              message: `⚠️ APPROVAL REQUIRED: ${args.action}\n\nThis action requires your explicit approval before proceeding.`
            });
          } else if (tc.name === 'confirm_action') {
            // HITL: User approved - proceed with the action
            result = JSON.stringify({
              status: "approved",
              action_id: args.action_id,
              action_type: args.action_type,
              message: `✅ Action confirmed: ${args.action_type}`
            });
          } else if (tc.name === 'recall_memory') {
            // Search agent memory for relevant past interactions
            const memories = context?.agentMemory || [];
            let filtered = memories;
            if (args.memory_type && args.memory_type !== 'all') {
              filtered = memories.filter((m: any) => m.type === args.memory_type);
            }
            // Simple keyword search as fallback if no embeddings
            const queryLower = (args.query || '').toLowerCase();
            const matched = filtered.filter((m: any) =>
              (m.content || '').toLowerCase().includes(queryLower)
            ).slice(0, 5);
            result = JSON.stringify({
              query: args.query,
              found: matched.length,
              memories: matched.map((m: any) => ({
                type: m.type,
                content: m.content,
                metadata: m.metadata,
                createdAt: m.createdAt
              }))
            });
          } else if (tc.name === 'store_memory') {
            // Store a new memory entry
            const newMemory = {
              userId: context?.userId || 'anonymous',
              type: args.memory_type,
              content: args.content,
              metadata: args.metadata || {},
              createdAt: new Date().toISOString(),
              embedding: [] // Will be populated by client-side save to Firestore
            };
            result = JSON.stringify({
              success: true,
              memory: newMemory,
              message: `Memory stored: ${args.content.substring(0, 50)}...`
            });
          } else if (tc.name === 'create_rfq') {
            // Create an RFQ in Firestore
            const rfqId = `RFQ-${Date.now()}`;
            const rfq = {
              id: rfqId,
              title: args.title,
              description: args.description,
              supplierIds: args.supplier_ids,
              dueDate: args.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
              budgetRange: args.budget_range,
              status: 'Draft',
              createdBy: context?.userId || 'agent',
              createdAt: new Date().toISOString(),
              auditTrail: [{ action: 'created', actorId: 'agent', timestamp: new Date().toISOString() }]
            };
            result = JSON.stringify({
              success: true,
              rfq,
              message: `RFQ "${args.title}" created with ID ${rfqId}. Ready to publish to ${args.supplier_ids.length} suppliers.`
            });
          } else if (tc.name === 'select_bid') {
            // Select a winning bid and create PO
            result = JSON.stringify({
              success: true,
              rfq_id: args.rfq_id,
              bid_id: args.bid_id,
              supplier_id: args.supplier_id,
              amount: args.amount,
              reasoning: args.reasoning,
              status: 'bid_selected',
              message: `Bid selected from supplier ${args.supplier_id} for ${args.amount}. Ready to create Purchase Order.`
            });
          } else if (tc.name === 'create_purchase_order') {
            const poId = `PO-${Date.now()}`;
            result = JSON.stringify({
              success: true,
              po: {
                id: poId,
                supplierId: args.supplier_id,
                items: args.items,
                totalAmount: args.total_amount,
                status: 'Pending Approval',
                createdAt: new Date().toISOString()
              },
              message: `Purchase Order ${poId} created for ${args.total_amount}. Awaiting approval.`
            });
          } else if (tc.name === 'track_delivery') {
            result = JSON.stringify({
              po_id: args.po_id,
              status: 'In Transit',
              estimated_delivery: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
              carrier: 'FedEx',
              tracking_number: `FX${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
              updates: [
                { date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], status: 'Order Placed' },
                { date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0], status: 'Shipped' },
                { date: new Date().toISOString().split('T')[0], status: 'In Transit' }
              ]
            });
          } else if (tc.name === 'process_payment') {
            result = JSON.stringify({
              success: true,
              po_id: args.po_id,
              invoice_id: args.invoice_id,
              amount: args.amount,
              status: 'payment_processed',
              three_way_match: 'passed',
              message: `Payment of ${args.amount} processed for PO ${args.po_id}. 3-way match validated.`
            });
          } else if (tc.name === 'process_invoice') {
            // Use Qwen vision to extract invoice data
            try {
              const visionResponse = await openai!.chat.completions.create({
                model: "qwen3.7-plus",
                messages: [{
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: { url: `data:image/${args.file_type === 'pdf' ? 'png' : args.file_type};base64,${args.invoice_data.substring(0, 100000)}` }
                    },
                    {
                      type: "text",
                      text: "Extract the following from this invoice and return as JSON: vendor_name, invoice_number, invoice_date, po_number, total_amount, tax_amount, line_items (array of {description, quantity, unit_price, total}). Return ONLY valid JSON."
                    }
                  ]
                }],
                temperature: 0.1,
              });
              const extracted = JSON.parse(visionResponse.choices[0]?.message?.content || '{}');
              result = JSON.stringify({
                success: true,
                extracted,
                three_way_match: extracted.po_number ? 'po_found' : 'no_po',
                message: `Invoice processed. Vendor: ${extracted.vendor_name || 'Unknown'}, Total: ${extracted.total_amount || 'N/A'}`
              });
            } catch (e) {
              console.error("Invoice OCR error:", e);
              result = JSON.stringify({
                success: false,
                error: "Failed to process invoice with vision model",
                message: "Invoice processing failed. Please try again or enter details manually."
              });
            }
          } else if (tc.name === 'delegate_to_specialist') {
            // Multi-agent: delegate to a specialized sub-agent
            try {
              let specialistPrompt = "";
              let specialistModel = "qwen3.6-flash"; // Cost-optimized for sub-agents

              if (args.specialist === 'risk_analyst') {
                specialistPrompt = `You are a procurement Risk Analyst specialist. Analyze the following and provide a detailed risk assessment with scores, checks, and recommendations.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
              } else if (args.specialist === 'bid_optimizer') {
                specialistPrompt = `You are a procurement Bid Optimization specialist. Compare and analyze bids, calculate value scores, and recommend the best option.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
              } else if (args.specialist === 'compliance_checker') {
                specialistPrompt = `You are a procurement Compliance specialist. Validate the following against procurement policies and regulations.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
              }

              const specialistResponse = await openai!.chat.completions.create({
                model: specialistModel,
                messages: [{ role: "user", content: specialistPrompt }],
                temperature: 0.2,
                max_tokens: 1500,
              });

              result = JSON.stringify({
                specialist: args.specialist,
                analysis: specialistResponse.choices[0]?.message?.content,
                usage: specialistResponse.usage
              });
            } catch (e) {
              console.error("Specialist agent error:", e);
              result = JSON.stringify({
                specialist: args.specialist,
                error: "Specialist agent unavailable",
                fallback: "Proceeding with main agent analysis."
              });
            }
          } else {
            result = "Success";
          }

          toolCallsMade.push({
            name: tc.name,
            arguments: args,
            result: result
          });

          // Send result event
          res.write(JSON.stringify({ type: "tool_result", name: tc.name, result: result }) + "\n");

          currentMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result
          });
        }
      } else {
        break;
      }
    }

    res.write(JSON.stringify({ type: "final", response: finalContent, tool_calls: toolCallsMade }) + "\n");
    res.end();
  } catch (error: any) {
    console.error("AI Error:", error);
    res.write(JSON.stringify({ type: "error", error: error.message }) + "\n");
    res.end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
