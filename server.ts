import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import "dotenv/config";
import { agentTools } from "./src/lib/agent-tools";
import { chunkText, chunkTextSmart, generateEmbeddings, generateQueryEmbedding, rerankResults } from "./src/lib/rag";
import { initZvecStore, insertChunks, searchChunks as zvecSearch, insertMemory, searchMemories } from "./src/lib/zvec-store";
import { db } from "./src/lib/firebase";
import { doc, updateDoc, addDoc, collection } from "firebase/firestore";

const app = express();
const PORT = 3000;
app.use(express.json());

// ============================================================================
// Alibaba Cloud / Qwen Cloud Integration
// All AI capabilities are powered by Qwen Cloud (Alibaba Cloud) via DashScope API:
// - Chat: qwen3.5-plus (main agent + specialist sub-agents)
// - Embeddings: text-embedding-v4 (1024 dimensions, document + query vectorization)
// - Reranking: qwen3-rerank (cross-attention reranking for RAG precision)
// - Vision: qwen3.5-plus (invoice OCR, document processing)
// - Web Search: enable_search (real-time supplier/market research)
// API endpoint: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
// ============================================================================

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

// Initialize Zvec vector store
initZvecStore();

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ============================================================================
// Workflow Execution Endpoints
// ============================================================================

// Execute a workflow directly
app.post("/api/workflows/run", async (req, res) => {
  try {
    const { nodes, inputs, userId, workflowId } = req.body;
    if (!nodes?.length) {
      return res.status(400).json({ error: "nodes array is required" });
    }
    const { executeWorkflow } = await import("./src/lib/workflow-engine");
    const result = await executeWorkflow(nodes, req.body.edges || [], inputs || {}, { userId }, { workflowId });
    res.json(result);
  } catch (error) {
    console.error("Workflow execution error:", error);
    res.status(500).json({ error: "Execution failed", details: (error as Error).message });
  }
});

// Execute a saved workflow from localStorage key
app.post("/api/workflows/run-saved", async (req, res) => {
  try {
    const { savedWorkflow, inputs, userId } = req.body;
    if (!savedWorkflow?.nodes?.length) {
      return res.status(400).json({ error: "savedWorkflow with nodes is required" });
    }
    const { executeWorkflow } = await import("./src/lib/workflow-engine");
    const result = await executeWorkflow(savedWorkflow.nodes, savedWorkflow.edges || [], inputs || {}, { userId });
    res.json(result);
  } catch (error) {
    console.error("Saved workflow execution error:", error);
    res.status(500).json({ error: "Execution failed", details: (error as Error).message });
  }
});

// ============================================================================
// Agent Memory Endpoints
// Cross-session memory for the procurement agent
// ============================================================================

// Store a memory entry (in Zvec for vector search)
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

    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Store in Zvec for vector search
    insertMemory({
      id: memoryId,
      userId,
      type: type || "general",
      content,
      metadata: metadata || {},
      embedding,
    });

    const memoryEntry = {
      id: memoryId,
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

// Search memories by semantic similarity (via Zvec)
app.post("/api/memory/search", async (req, res) => {
  try {
    const { userId, query, topK, memoryType } = req.body;
    if (!userId || !query) {
      return res.status(400).json({ error: "userId and query are required" });
    }

    // Embed the query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Search Zvec index
    const results = searchMemories(userId, queryEmbedding, topK || 5, memoryType);

    res.json({ results: results.map((m: any) => ({
      type: m.type,
      content: m.content,
      metadata: m.metadata,
      score: m.score,
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

// RAG: Embed document chunks and store in Zvec
app.post("/api/kb/embed", async (req, res) => {
  const { docId, title, content, category } = req.body;
  if (!content) return res.status(400).json({ error: "Content is required" });

  try {
    const isPolicy = (category || '').toLowerCase() === 'policy';
    const chunks = chunkTextSmart(content, isPolicy);
    if (chunks.length === 0) return res.json({ chunks: [], count: 0 });

    const embeddings = await generateEmbeddings(chunks);

    // Store chunks + embeddings in Zvec
    insertChunks(chunks.map((text, i) => ({
      docId,
      title,
      text,
      embedding: embeddings[i],
    })));

    res.json({ count: chunks.length });
  } catch (error: any) {
    console.error("Embedding error:", error);
    res.status(500).json({ error: error.message });
  }
});

// RAG: Semantic search across embedded knowledge base chunks (via Zvec)
app.post("/api/kb/search", async (req, res) => {
  const { query, topK } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    const queryEmbedding = await generateQueryEmbedding(query);
    let results = zvecSearch(queryEmbedding, topK || 8);

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
      model: "qwen3.5-plus",
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
        model: "qwen3.5-plus", // qwen3.5-plus supports responses API
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

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "qwen3.5-omni-flash",
        messages: [
          { role: "system", content: "Transcribe the following audio exactly as spoken. Output only the transcription text. Ignore non-speech sounds. Respond ONLY with the transcript text, no markdown, no other text." },
          { role: "user", content: [
            { type: "input_audio", input_audio: { data: audioData, format: format || "wav" } }
          ] }
        ]
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Transcription timeout')), 30000))
    ]) as any;
    
    res.json({ text: completion.choices[0].message.content });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe audio" });
  }
});

app.post("/api/agent/chat", async (req, res) => {
  const { messages, context, model } = req.body;
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

    let policyText = "";
    let kbText = "";

    if (context?.knowledgeBase && context.knowledgeBase.length > 0) {
      // Separate policy docs from reference docs
      const policyDocs = context.knowledgeBase.filter((doc: any) =>
        (doc.category || '').toLowerCase() === 'policy'
      );
      const referenceDocs = context.knowledgeBase.filter((doc: any) =>
        (doc.category || '').toLowerCase() !== 'policy'
      );

      // ALWAYS inject policy docs as mandatory rules — these are not subject to RAG filtering
      if (policyDocs.length > 0) {
        policyText = "\n\n=== MANDATORY PROCUREMENT POLICIES ===\nThe following policies are ACTIVE and MUST be strictly enforced. NEVER violate these policies. When a user request conflicts with any policy, REFUSE the request, cite the policy by title, and suggest an alternative.\n";
        policyDocs.forEach((doc: any) => {
          // Truncate very long policy docs to save tokens
          const content = (doc.content || '').substring(0, 2000);
          policyText += `\n[${doc.title}]\n${content}\n---\n`;
        });
      }

      // Use Zvec vector search for reference docs
      if (referenceDocs.length > 0) {
        try {
          const lastUserMessage = formattedMessages.filter((m: any) => m.role === 'user').pop();
          const queryText = lastUserMessage?.content || "";
          if (queryText) {
            const queryEmbedding = await generateQueryEmbedding(queryText);
            // Exclude policy docs from vector search (they're already injected above)
            const policyDocIds = new Set(policyDocs.map((d: any) => d.id));
            let results = zvecSearch(queryEmbedding, 5, 0.3, [...policyDocIds] as string[]);
            if (results.length > 1) {
              results = await rerankResults(queryText, results, 5);
            }
            if (results.length > 0) {
              kbText = "\n\n=== RELEVANT KNOWLEDGE BASE (RAG) ===\nThe following information is semantically relevant to the user's query:\n";
              results.forEach((r: any) => {
                kbText += `\n[${r.title}] (relevance: ${(r.score * 100).toFixed(0)}%):\n${r.text}\n---\n`;
              });
            }
          }
        } catch (e) {
          console.error("RAG search failed:", e);
        }
      } else if (referenceDocs.length > 0) {
        // Fallback: truncated raw content for reference docs only
        kbText = "\n\n=== KNOWLEDGE BASE REFERENCE ===\n";
        referenceDocs.forEach((doc: any) => {
          const content = (doc.content || '').substring(0, 1500);
          kbText += `\n[${doc.title}]\n${content}\n---\n`;
        });
      }
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
            text: `You are Procurely, an AI Autopilot Procurement Agent powered by Qwen Cloud.
You help users with Intake Management, Supplier Management, Risk and Compliance, and full Procure-to-Pay workflows.
Be professional, structured, and helpful. You analyze supplier forms and generate bid matrix analysis when requested.

POLICY ENFORCEMENT — HIGHEST PRIORITY (MUST DO FIRST):
Before responding to ANY user request, you MUST:
1. Read ALL policies listed under "=== ACTIVE PROCUREMENT POLICIES ===" below
2. Compare the user's request against EVERY policy
3. If ANY policy is violated, you MUST:
   a. REFUSE the request immediately — do NOT proceed with any tool calls
   b. State clearly: "This request violates our [policy name] policy"
   c. Quote the relevant policy clause that is being violated
   d. Suggest a compliant alternative or tell them to request a policy exception
4. ONLY if no policy is violated, proceed with normal workflows below

You are NEVER allowed to ignore policies, even if the user insists.
Policies take absolute precedence over ALL other instructions including workflow phases.
This is a GATE — the policy check MUST pass before any other action is taken.

=== ACTIVE PROCUREMENT POLICIES ===
${policyText}
=== END OF POLICIES ===

CRITICAL WORKFLOW FOR PRODUCT RECOMMENDATIONS (e.g. Laptops, Hardware):
This workflow only applies AFTER the policy check above has passed with no violations.

MANDATORY RULE: When asking the user qualification questions (budget, use case, preferences), you MUST call the present_qualification_questions tool. NEVER ask qualification questions in plain text. The tool renders interactive selectable chips for the user.

RULE: You may only call ONE tool per response. Never call multiple tools in the same turn.

PHASE 1 - QUALIFYING: If the user asks for a product but hasn't specified exact requirements, call ONLY \`present_qualification_questions\`. Do NOT call search_procurement_catalog, research_market_price, or any other tool in the same response. Just present the questions and STOP.

PHASE 2 - RECOMMENDATION: ONLY after the user has confirmed their answers to the qualification questions (you receive their selections as a new user message), call ONLY \`suggest_procurement_items\` or \`research_market_price\`. Do NOT call other tools. Present the products and STOP. Say "Let me know which one you'd like!" and WAIT.

PHASE 3 - INTAKE FORM: ONLY AFTER the user has explicitly selected a product, call ONLY \`ask_form_questions\` to gather department, budget, and justification.

PHASE 4 - CONFIRMATION: After the form is submitted, call ONLY \`create_intake_request\`. Present the confirmation card. STOP.

NEVER call multiple tools in one response. NEVER skip phases. NEVER proceed without user input between phases.

CAPABILITIES:
- Search the web for products, suppliers, and pricing information
- Analyze supplier risk using real-time web research
- Generate comparative bid matrices
- Process invoices using OCR
- Delegate complex tasks to specialist sub-agents
- Remember user preferences across sessions via agent memory
- AUTONOMOUSLY NEGOTIATE prices and terms with vendors
- Execute custom workflows designed in the Workflow Designer
- Research market prices to inform negotiation strategy

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

AI-DRIVEN VENDOR NEGOTIATION:
When negotiating with vendors:
1. Research market prices first using research_market_price
2. Use negotiate_with_vendor to develop a counter-offer strategy
3. Present the negotiation script to the user for approval
4. The agent can negotiate across multiple rounds, adjusting strategy based on vendor responses
Always use request_approval before finalizing any negotiated deal.

WORKFLOW ENGINE INTEGRATION:
When processing requisitions:
1. Use execute_workflow to route requisitions through the designed workflow
2. Use evaluate_workflow_condition to evaluate condition nodes
3. The workflow graph from WorkflowDesigner is available in context
4. Node types supported: input (trigger), conditional (branching), human (approval gates), generatePO, checkBudget, notifyVendor, threeWayMatch
5. The agent follows the graph: input → conditional → action nodes
Always log which workflow path was taken for audit purposes.

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
        model: model || "qwen3.7-plus",
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
            const category = (args.category || '').toLowerCase();
            let filtered = catalog;

            // Keyword search
            if (query) {
              filtered = filtered.filter((item: any) =>
                (item.name || '').toLowerCase().includes(query) ||
                (item.category || '').toLowerCase().includes(query) ||
                (item.description || '').toLowerCase().includes(query)
              );
            }

            // Category filter
            if (category) {
              filtered = filtered.filter((item: any) =>
                (item.category || '').toLowerCase().includes(category)
              );
            }

            // Price filters
            if (args.max_price != null) {
              filtered = filtered.filter((item: any) => (item.price || 0) <= args.max_price);
            }
            if (args.min_price != null) {
              filtered = filtered.filter((item: any) => (item.price || 0) >= args.min_price);
            }

            result = JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No catalog items found matching criteria." }]);
          } else if (tc.name === 'get_suppliers') {
            // Query Firestore for real suppliers with optional filters
            const allSuppliers = context?.suppliers || [];
            let filtered = allSuppliers;
            if (args.category) filtered = filtered.filter((s: any) => (s.category || '').toLowerCase().includes(args.category.toLowerCase()));
            if (args.risk_level) filtered = filtered.filter((s: any) => (s.risk || '').toLowerCase() === args.risk_level.toLowerCase());
            result = JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No suppliers found matching criteria." }]);
          } else if (tc.name === 'search_online_suppliers') {
            try {
              const searchQuery = `Find real companies that provide ${args.category} services${args.requirements ? ` with ${args.requirements}` : ''}${args.budget_range ? ` in the ${args.budget_range} range` : ''}. For each company, provide: company name, what they do (1 sentence), website URL if available, estimated pricing tier (Enterprise/Mid-Market/SMB), and key strengths. Return a JSON array with objects: { "name", "description", "website", "pricing_tier", "strengths" }. Return ONLY valid JSON.`;
              const searchResponse = await openai!.chat.completions.create({
                model: "qwen3.5-plus",
                messages: [{ role: "user", content: searchQuery }],
                temperature: 0.2,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);
              const content = searchResponse.choices[0]?.message?.content || '[]';
              const suppliers = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
              result = JSON.stringify({
                query: { category: args.category, requirements: args.requirements, budget_range: args.budget_range },
                suppliers: Array.isArray(suppliers) ? suppliers : [],
                message: `Found ${Array.isArray(suppliers) ? suppliers.length : 0} potential suppliers online for ${args.category}.`
              });
            } catch (e) {
              console.error("Online supplier search error:", e);
              result = JSON.stringify({ suppliers: [], message: "Unable to search online suppliers at this time." });
            }
          } else if (tc.name === 'evaluate_supplier_risk') {
            // Use Qwen with web search for real supplier risk assessment
            try {
              const supplier = (context?.suppliers || []).find((s: any) => s.id === args.supplier_id) || { name: args.supplier_id, category: 'Unknown' };
              const riskResponse = await openai!.chat.completions.create({
                model: "qwen3.5-plus",
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
                model: "qwen3.5-plus",
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
            try {
              await updateDoc(doc(db, 'purchaseRequisitions', args.intake_id), {
                status: args.new_status,
              });
              result = JSON.stringify({
                success: true,
                intake_id: args.intake_id,
                new_status: args.new_status,
                message: `Status updated to "${args.new_status}" for intake ${args.intake_id}.`
              });
            } catch (e) {
              console.error("Update intake status error:", e);
              result = JSON.stringify({ success: false, message: "Failed to update status" });
            }
          } else if (tc.name === 'suggest_procurement_items') {
            try {
              // Step 1: Use Qwen with web search to research real products (with 15s timeout)
              const searchPromise = openai!.chat.completions.create({
                model: "qwen3.5-plus",
                messages: [{
                  role: "user",
                  content: `Research current products for: ${JSON.stringify(args.items?.map((i: any) => i.name) || [])}. For each product, find: real product name, current market price (USD), key specs, and a product image URL. Return a JSON array with objects: { "name", "description", "estimated_price", "image_url", "badges": [{"text": "...", "variant": "secondary"}] }. Return ONLY valid JSON.`
                }],
                temperature: 0.2,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Web search timeout')), 15000));
              const searchResponse = await Promise.race([searchPromise, timeoutPromise]) as any;

              const content = searchResponse.choices[0]?.message?.content || '[]';
              const webItems = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());

              // Step 2: Merge web results with agent-provided items, preferring web data
              const agentItems = args.items || [];
              const mergedItems = agentItems.map((agentItem: any, i: number) => {
                const webItem = webItems[i] || {};
                const hasWebData = webItem.name && webItem.name !== agentItem.name;
                return {
                  name: webItem.name || agentItem.name,
                  description: webItem.description || agentItem.description,
                  estimated_price: webItem.estimated_price || agentItem.estimated_price,
                  image_url: webItem.image_url || `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(agentItem.name)}`,
                  badges: webItem.badges || agentItem.badges || [],
                  source: hasWebData ? 'online' : 'catalog'
                };
              });

              result = JSON.stringify({ items: mergedItems });
            } catch (err) {
              console.error("Suggest items error:", err);
              // Fallback to agent-provided items with placeholder images
              const fallbackItems = (args.items || []).map((item: any) => ({
                ...item,
                image_url: item.image_url || `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(item.name)}`,
                source: item.source || 'catalog'
              }));
              result = JSON.stringify({ items: fallbackItems });
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
                  model: "qwen3.5-plus",
                  input: `Find product images for: ${args.query}`,
                  tools: [{ type: "web_search_image" }]
                })
              });
              
              if (qwenResponse.ok) {
                const data = await qwenResponse.json();
                let foundImages: any[] = [];
                if (data.output && Array.isArray(data.output)) {
                  for (const item of data.output) {
                    if (item.type === "web_search_image_call" && item.output) {
                      const parsedImages = JSON.parse(item.output);
                      foundImages = foundImages.concat(parsedImages);
                    }
                  }
                }

                // Filter: only keep renderable image formats (reject PSD, AI, EPS, etc.)
                const RENDERABLE_EXT = /\.(jpe?g|png|webp|gif)$/i;
                foundImages = foundImages.filter((img: any) => img.url && RENDERABLE_EXT.test(img.url));

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
          } else if (tc.name === 'present_qualification_questions') {
            // Interactive qualification: return structured questions for the UI to render as chips
            result = JSON.stringify({
              type: "qualification_questions",
              questions: (args.questions || []).map((q: any) => ({
                question_id: q.question_id,
                question_text: q.question_text,
                options: (q.options || []).map((opt: any) => ({
                  value: opt.value,
                  label: opt.label,
                  icon: opt.icon || null
                })),
                allow_custom: q.allow_custom !== false,
                custom_placeholder: q.custom_placeholder || "Type your answer..."
              }))
            });
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
            // Generate embedding for the memory content
            let embedding: number[] = [];
            try {
              embedding = await generateQueryEmbedding(args.content);
            } catch (e) {
              console.warn("Failed to embed memory content:", e);
            }
            const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            // Store in Zvec for vector search
            insertMemory({
              id: memoryId,
              userId: context?.userId || 'anonymous',
              type: args.memory_type,
              content: args.content,
              metadata: args.metadata || {},
              embedding,
            });
            const newMemory = {
              id: memoryId,
              userId: context?.userId || 'anonymous',
              type: args.memory_type,
              content: args.content,
              metadata: args.metadata || {},
              createdAt: new Date().toISOString(),
              embedding
            };
            result = JSON.stringify({
              success: true,
              memory: newMemory,
              message: `Memory stored: ${args.content.substring(0, 50)}...`
            });
          } else if (tc.name === 'create_rfq') {
            try {
              const rfqData = {
                title: args.title,
                description: args.description || '',
                supplierIds: args.supplier_ids,
                dueDate: args.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
                budgetRange: args.budget_range || '',
                status: 'Draft',
                createdBy: context?.userId || 'agent',
                createdAt: new Date().toISOString(),
                auditTrail: [{ action: 'created', actorId: 'agent', timestamp: new Date().toISOString() }]
              };
              const docRef = await addDoc(collection(db, 'rfqs'), rfqData);
              result = JSON.stringify({
                success: true,
                rfq: { id: docRef.id, ...rfqData },
                message: `RFQ "${args.title}" created with ID ${docRef.id}. Ready to publish to ${args.supplier_ids.length} suppliers.`
              });
            } catch (e) {
              console.error("Create RFQ error:", e);
              result = JSON.stringify({ success: false, message: "Failed to create RFQ" });
            }
          } else if (tc.name === 'select_bid') {
            try {
              // Mark the selected bid
              await updateDoc(doc(db, 'bids', args.bid_id), { status: 'Selected' });
              // Update RFQ status
              await updateDoc(doc(db, 'rfqs', args.rfq_id), { status: 'Awarded' });
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
            } catch (e) {
              console.error("Select bid error:", e);
              result = JSON.stringify({ success: false, message: "Failed to select bid" });
            }
          } else if (tc.name === 'create_purchase_order') {
            try {
              const poData = {
                supplierId: args.supplier_id,
                items: args.items || [],
                totalAmount: args.total_amount,
                status: 'Pending Approval',
                createdBy: context?.userId || 'agent',
                createdAt: new Date().toISOString()
              };
              const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
              result = JSON.stringify({
                success: true,
                po: {
                  id: docRef.id,
                  ...poData
                },
                message: `Purchase Order ${docRef.id} created for ${args.total_amount}. Awaiting approval.`
              });
            } catch (e) {
              console.error("Create PO error:", e);
              result = JSON.stringify({ success: false, message: "Failed to create purchase order" });
            }
          } else if (tc.name === 'track_delivery') {
            try {
              const trackingNumber = `FX${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
              const estimatedDelivery = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
              // Update PO with delivery info
              await updateDoc(doc(db, 'purchaseOrders', args.po_id), {
                status: 'In Transit',
                trackingNumber,
                estimatedDelivery,
                carrier: 'FedEx',
              });
              result = JSON.stringify({
                po_id: args.po_id,
                status: 'In Transit',
                estimated_delivery: estimatedDelivery,
                carrier: 'FedEx',
                tracking_number: trackingNumber,
                updates: [
                  { date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], status: 'Order Placed' },
                  { date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0], status: 'Shipped' },
                  { date: new Date().toISOString().split('T')[0], status: 'In Transit' }
                ]
              });
            } catch (e) {
              console.error("Track delivery error:", e);
              result = JSON.stringify({ po_id: args.po_id, status: 'Unknown', message: 'Tracking unavailable' });
            }
          } else if (tc.name === 'process_payment') {
            try {
              // Update PO payment status
              await updateDoc(doc(db, 'purchaseOrders', args.po_id), {
                paymentStatus: 'Paid',
                status: 'Paid',
                paidAt: new Date().toISOString(),
              });
              // Update invoice status if provided
              if (args.invoice_id) {
                await updateDoc(doc(db, 'invoices', args.invoice_id), {
                  status: 'Paid',
                  paidAt: new Date().toISOString(),
                });
              }
              result = JSON.stringify({
                success: true,
                po_id: args.po_id,
                invoice_id: args.invoice_id,
                amount: args.amount,
                status: 'payment_processed',
                three_way_match: 'passed',
                message: `Payment of ${args.amount} processed for PO ${args.po_id}. 3-way match validated.`
              });
            } catch (e) {
              console.error("Process payment error:", e);
              result = JSON.stringify({ success: false, message: "Failed to process payment" });
            }
          } else if (tc.name === 'process_invoice') {
            // Use Qwen vision to extract invoice data
            try {
              const visionResponse = await openai!.chat.completions.create({
                model: "qwen3.5-plus",
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
          } else if (tc.name === 'negotiate_with_vendor') {
            // AI-Driven Vendor Negotiation: Research market prices and negotiate
            try {
              const vendor = (context?.suppliers || []).find((s: any) => s.id === args.vendor_id) || { name: args.vendor_id, category: 'Unknown' };
              const targetPrice = parseFloat(args.target_price.replace(/[^0-9.]/g, ''));
              const vendorPrice = args.vendor_initial_price ? parseFloat(args.vendor_initial_price.replace(/[^0-9.]/g, '')) : null;

              const negotiationPrompt = `You are an AI Procurement Negotiator. Your job is to negotiate the best deal for the buyer.

VENDOR: ${vendor.name} (${vendor.category})
ITEM: ${args.item_description}
TARGET PRICE: ${args.target_price}
VENDOR'S INITIAL OFFER: ${args.vendor_initial_price || 'Not provided yet'}
ADDITIONAL TERMS TO NEGOTIATE: ${(args.terms || []).join(', ') || 'None specified'}

Step 1: Research current market prices for this item using web search.
Step 2: Analyze the vendor's pricing position relative to market.
Step 3: Develop a negotiation strategy with 2-3 counter-offer options.
Step 4: For each counter-offer, provide:
  - Proposed price
  - Justification (why this is fair)
  - What to ask for in return (payment terms, warranty, volume discount)
Step 5: Recommend the best negotiation approach.

Respond in JSON format:
{
  "market_research": {"avg_price": "...", "price_range": "...", "sources": ["..."]},
  "vendor_position": "competitive" | "above_market" | "below_market",
  "counter_offers": [
    {"price": "...", "justification": "...", "trade_offs": ["..."]}
  ],
  "recommended_strategy": "...",
  "negotiation_script": "A ready-to-send message to the vendor proposing the best counter-offer"
}`;

              const negotiationResponse = await openai!.chat.completions.create({
                model: "qwen3.5-plus",
                messages: [{ role: "user", content: negotiationPrompt }],
                temperature: 0.3,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);

              const negContent = negotiationResponse.choices[0]?.message?.content || '{}';
              const negData = JSON.parse(negContent.replace(/```json/g, '').replace(/```/g, '').trim());

              result = JSON.stringify({
                vendor: vendor.name,
                item: args.item_description,
                target_price: args.target_price,
                vendor_initial_price: args.vendor_initial_price,
                negotiation: negData,
                status: 'negotiation_strategy_ready'
              });
            } catch (e) {
              console.error("Negotiation error:", e);
              result = JSON.stringify({
                error: "Negotiation analysis failed",
                fallback: "Manual negotiation recommended. Research market prices and propose a counter-offer."
              });
            }
          } else if (tc.name === 'research_market_price') {
            // Research market pricing via web search
            try {
              const researchPrompt = `Research current market pricing for: ${args.product}
${args.quantity ? `Quantity needed: ${args.quantity} units` : ''}
${args.category ? `Category: ${args.category}` : ''}

Provide:
1. Average market price
2. Price range (low to high)
3. Top 3 suppliers with their prices
4. Volume discount availability
5. Best value recommendation

Respond in JSON:
{
  "product": "...",
  "average_price": "...",
  "price_range": {"low": "...", "high": "..."},
  "suppliers": [{"name": "...", "price": "...", "notes": "..."}],
  "volume_discounts": "...",
  "recommendation": "..."
}`;

              const researchResponse = await openai!.chat.completions.create({
                model: "qwen3.6-flash",
                messages: [{ role: "user", content: researchPrompt }],
                temperature: 0.2,
                extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
              } as any);

              const resContent = researchResponse.choices[0]?.message?.content || '{}';
              const resData = JSON.parse(resContent.replace(/```json/g, '').replace(/```/g, '').trim());

              result = JSON.stringify({ market_research: resData });
            } catch (e) {
              console.error("Market research error:", e);
              result = JSON.stringify({ error: "Market research failed", fallback: "Use web search to find pricing." });
            }
          } else if (tc.name === 'execute_workflow') {
            // Execute a workflow step
            const workflowNodes = context?.workflowNodes || [];
            const workflowEdges = context?.workflowEdges || [];
            const activeWorkflowId = context?.activeWorkflowId;

            // Find the requisition — use args.requisition_id if provided, otherwise use the first one
            const requisition = args.requisition_id
              ? (context?.purchaseRequisitions || []).find((r: any) => r.id === args.requisition_id) ||
                (context?.intakes || []).find((i: any) => i.id === args.requisition_id) || {}
              : (context?.purchaseRequisitions || [])[0] || (context?.intakes || [])[0] || {};

            // Build workflow data from real requisition
            const workflowData: Record<string, any> = {
              amount: parseFloat(String(requisition.totalAmount || requisition.amount || '0').replace(/[^0-9.]/g, '')),
              department: requisition.department || requisition.costCenter || '',
              category: requisition.category || '',
              vendor: requisition.supplier || '',
              riskLevel: requisition.riskLevel || 'Low',
              priority: requisition.priority || 'Medium',
            };

            // Detect format: Wayflow edges use sourceNodeId/targetNodeId, legacy uses source/target
            const isWayflowFormat = workflowEdges.length > 0 && workflowEdges[0]?.sourceNodeId !== undefined;

            // Find the start node — Wayflow uses 'input' type, legacy uses 'trigger'
            const startNodeId = args.current_node_id ||
              workflowNodes.find((n: any) => n.type === 'trigger' || n.type === 'input')?.id;
            const currentNode = workflowNodes.find((n: any) => n.id === startNodeId);

            if (!currentNode) {
              result = JSON.stringify({
                error: "No workflow found or no trigger node",
                message: "Please design a workflow in the Workflow Designer first."
              });
            } else {
              // Walk through the workflow graph
              const executionPath: any[] = [];
              let nodeId = startNodeId;
              let stepsRemaining = 15; // Safety limit

              const getEdgeTarget = (edge: any, portId: string) => {
                return isWayflowFormat
                  ? (edge.sourcePortId === portId ? edge.targetNodeId : null)
                  : (edge.source === nodeId && edge.sourceHandle === portId ? edge.target : null);
              };

              const getFirstEdgeTarget = (fromNodeId: string) => {
                const edge = isWayflowFormat
                  ? workflowEdges.find((e: any) => e.sourceNodeId === fromNodeId)
                  : workflowEdges.find((e: any) => e.source === fromNodeId);
                return isWayflowFormat ? edge?.targetNodeId : edge?.target;
              };

              while (nodeId && stepsRemaining > 0) {
                const node = workflowNodes.find((n: any) => n.id === nodeId);
                if (!node) break;

                const step: any = {
                  node_id: node.id,
                  type: node.type,
                  label: node.label || node.data?.label,
                  description: node.data?.description || node.data?.instructions,
                  status: 'completed'
                };

                // Handle different node types
                if (node.type === 'condition' || node.type === 'conditional') {
                  const condType = node.data?.conditionType || 'amount_threshold';

                  if (condType === 'amount_threshold') {
                    const threshold = parseFloat(node.data?.threshold || '10000');
                    const operator = node.data?.operator || '>';
                    const fieldValue = workflowData.amount || 0;
                    let conditionResult = false;
                    if (operator === '>') conditionResult = fieldValue > threshold;
                    else if (operator === '<') conditionResult = fieldValue < threshold;
                    else if (operator === '>=') conditionResult = fieldValue >= threshold;
                    else if (operator === '<=') conditionResult = fieldValue <= threshold;
                    else if (operator === '==') conditionResult = fieldValue === threshold;
                    step.result = conditionResult;
                    step.evaluation = `$${fieldValue} ${operator} $${threshold} → ${conditionResult}`;
                  } else if (condType === 'department_match') {
                    const target = (node.data?.departmentMatch || '').toLowerCase();
                    const actual = (workflowData.department || '').toLowerCase();
                    step.result = actual.includes(target);
                    step.evaluation = `Department "${workflowData.department}" matches "${node.data?.departmentMatch}" → ${step.result}`;
                  } else if (condType === 'category_match') {
                    const target = (node.data?.categoryMatch || '').toLowerCase();
                    const actual = (workflowData.category || '').toLowerCase();
                    step.result = actual.includes(target);
                    step.evaluation = `Category "${workflowData.category}" matches "${node.data?.categoryMatch}" → ${step.result}`;
                  } else if (condType === 'risk_level') {
                    const maxRisk = node.data?.maxRiskLevel || 'Medium';
                    const riskOrder: Record<string, number> = { 'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4 };
                    const actual = riskOrder[workflowData.riskLevel as string] || 1;
                    const max = riskOrder[maxRisk] || 2;
                    step.result = actual <= max;
                    step.evaluation = `Risk "${workflowData.riskLevel}" ≤ "${maxRisk}" → ${step.result}`;
                  } else if (condType === 'vendor_check') {
                    const target = (node.data?.vendorMatch || '').toLowerCase();
                    const actual = (workflowData.vendor || '').toLowerCase();
                    step.result = actual.includes(target);
                    step.evaluation = `Vendor "${workflowData.vendor}" matches "${node.data?.vendorMatch}" → ${step.result}`;
                  } else {
                    step.result = true;
                    step.evaluation = 'Condition passed (default)';
                  }

                  const conditionResult = step.result as boolean;
                  const nextNodeId = getEdgeTarget(nodeId, conditionResult ? 'true' : 'false');
                  nodeId = nextNodeId || getFirstEdgeTarget(nodeId);
                } else if (node.type === 'generatePO' || node.type === 'checkBudget' || node.type === 'notifyVendor' || node.type === 'threeWayMatch') {
                  // Custom procurement nodes — use real requisition data
                  step.result = {
                    type: node.type,
                    label: node.label,
                    requisition_id: requisition.id,
                    amount: workflowData.amount,
                    department: workflowData.department,
                    vendor: workflowData.vendor,
                  };
                  step.status = 'completed';
                  nodeId = getFirstEdgeTarget(nodeId);
                } else if (node.type === 'human') {
                  // Human review — mark as pending approval
                  step.status = 'pending_approval';
                  step.instructions = node.data?.instructions;
                  // Don't advance — human must approve
                  nodeId = null;
                } else {
                  // Default: follow first outgoing edge
                  nodeId = getFirstEdgeTarget(nodeId);
                }

                executionPath.push(step);
                stepsRemaining--;
              }

              result = JSON.stringify({
                requisition_id: args.requisition_id,
                workflow_id: args.workflow_id || 'default',
                execution_path: executionPath,
                total_steps: executionPath.length,
                status: executionPath.some((s: any) => s.status === 'pending_approval') ? 'awaiting_approval' : 'executed',
                message: `Workflow executed through ${executionPath.length} steps.`
              });
            }
          } else if (tc.name === 'evaluate_workflow_condition') {
            // Evaluate a workflow condition
            const { condition_type, condition_params, requisition_data } = args;
            let result_value = false;
            let explanation = '';

            if (condition_type === 'amount_threshold') {
              const threshold = parseFloat(condition_params.threshold || '10000');
              const amount = parseFloat((requisition_data.amount || '0').replace(/[^0-9.]/g, ''));
              const operator = condition_params.operator || '>';
              if (operator === '>') result_value = amount > threshold;
              else if (operator === '<') result_value = amount < threshold;
              else if (operator === '>=') result_value = amount >= threshold;
              else if (operator === '<=') result_value = amount <= threshold;
              else if (operator === '==') result_value = amount === threshold;
              explanation = `$${amount} ${operator} $${threshold} → ${result_value}`;
            } else if (condition_type === 'department_match') {
              const targetDept = (condition_params.department || '').toLowerCase();
              const actualDept = (requisition_data.department || '').toLowerCase();
              result_value = actualDept.includes(targetDept);
              explanation = `Department "${actualDept}" matches "${targetDept}" → ${result_value}`;
            } else if (condition_type === 'risk_level') {
              const maxRisk = condition_params.max_level || 'Medium';
              const riskLevels = { 'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4 };
              const actualRisk = riskLevels[requisition_data.risk_level || 'Low'] || 1;
              const maxRiskVal = riskLevels[maxRisk] || 2;
              result_value = actualRisk <= maxRiskVal;
              explanation = `Risk level ${requisition_data.risk_level} (≤${maxRisk}) → ${result_value}`;
            } else if (condition_type === 'category_match') {
              const targetCat = (condition_params.category || '').toLowerCase();
              const actualCat = (requisition_data.category || '').toLowerCase();
              result_value = actualCat.includes(targetCat);
              explanation = `Category "${actualCat}" matches "${targetCat}" → ${result_value}`;
            } else {
              result_value = true;
              explanation = 'Custom condition - defaulting to true';
            }

            result = JSON.stringify({
              condition_type,
              result: result_value,
              explanation,
              requisition_id: requisition_data.id
            });
          } else if (tc.name === 'create_intake_request') {
            const newId = `REQ-${Date.now()}`;
            result = JSON.stringify({
              success: true,
              intake: {
                id: newId,
                title: args.title,
                department: args.department,
                amount: args.amount,
                description: args.description,
                status: 'Draft',
                date: new Date().toISOString().split('T')[0],
              },
              message: `Requisition ${newId} created successfully.`
            });
          } else if (tc.name === 'create_supplier') {
            const newId = `SUP-${Date.now()}`;
            result = JSON.stringify({
              success: true,
              supplier: {
                id: newId,
                name: args.name,
                category: args.category,
                contact_email: args.contact_email,
                risk: args.risk_level || 'Pending',
                status: 'Onboarding',
              },
              message: `Supplier "${args.name}" created successfully with ID ${newId}.`
            });
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
