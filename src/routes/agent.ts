import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { requireAuth } from "../lib/auth-middleware";
import { agentTools } from "../lib/agent-tools";
import { generateQueryEmbedding, rerankResults } from "../lib/rag";
import { searchChunks as zvecSearch } from "../lib/zvec-store";
import { executeToolCall } from "../lib/tool-executor";

// Phase detection: determine which phase the conversation is in
function detectPhase(messages: any[]): "qualifying" | "recommendation" | "intake" | "confirmation" | "general" {
  const toolCallsMade: string[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCallsMade.push(tc.function?.name || tc.name || "");
      }
    }
  }

  // Check from most recent to oldest
  if (toolCallsMade.includes("create_intake_request")) return "confirmation";
  if (toolCallsMade.includes("ask_form_questions")) return "intake";
  if (toolCallsMade.includes("suggest_procurement_items") || toolCallsMade.includes("research_market_price")) return "recommendation";
  if (toolCallsMade.includes("present_qualification_questions")) return "recommendation";
  return "general";
}

// Get tools allowed for the current phase
function getToolsForPhase(phase: string): any[] {
  const getToolName = (t: any) => t.function?.name || "";
  switch (phase) {
    case "qualifying":
      return agentTools.filter(t => getToolName(t) === "present_qualification_questions");
    case "recommendation":
      return agentTools.filter(t =>
        getToolName(t) === "suggest_procurement_items" ||
        getToolName(t) === "research_market_price"
      );
    case "intake":
      return agentTools.filter(t => getToolName(t) === "ask_form_questions");
    case "confirmation":
      return agentTools.filter(t => getToolName(t) === "create_intake_request");
    default:
      return agentTools;
  }
}

const SYSTEM_PROMPT = `You are Procurely, an AI Autopilot Procurement Agent powered by Qwen Cloud.
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

=== END OF POLICIES ===

CRITICAL WORKFLOW FOR PRODUCT RECOMMENDATIONS (e.g. Laptops, Hardware):
This workflow only applies AFTER the policy check above has passed with no violations.

MANDATORY RULE: When asking the user qualification questions (budget, use case, preferences), you MUST call the present_qualification_questions tool. NEVER ask qualification questions in plain text. The tool renders interactive selectable chips for the user.

RULE: You may only call ONE tool per response. Never call multiple tools in the same turn.

PHASE 1 - QUALIFYING: If the user asks for a product but hasn't specified exact requirements, call ONLY present_qualification_questions. Do NOT call search_procurement_catalog, research_market_price, suggest_procurement_items, search_online_suppliers, or any other tool in the same response. Just present the questions and STOP. WAIT for the user to click "Confirm Selections & Continue" before proceeding.

PHASE 2 - RECOMMENDATION: ONLY after the user has clicked "Confirm Selections & Continue" and you receive their COMPLETE answers as a new user message, call ONLY suggest_procurement_items. This tool handles web search internally. Do NOT call search_procurement_catalog, search_online_suppliers, research_market_price, or any other tool. Present the products and STOP. Say "Let me know which one you'd like!" and WAIT.

PHASE 3 - INTAKE FORM: ONLY AFTER the user has explicitly selected a product, call ONLY ask_form_questions to gather department, budget, and justification.

PHASE 4 - CONFIRMATION: After the form is submitted, call ONLY create_intake_request. Present the confirmation card. STOP.

NEVER call multiple tools in one response. NEVER skip phases. NEVER proceed without user input between phases. NEVER call search tools when presenting qualification questions. NEVER show qualification question text after the user has already confirmed their selections.

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

REMINDER: NEVER call search tools (search_procurement_catalog, research_market_price, suggest_procurement_items) in the SAME response as present_qualification_questions. The user must click "Confirm Selections & Continue" FIRST, then you receive their answers in a NEW message, THEN you can search.

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

IMPORTANT: NEVER combine Qualifying, Recommending, and Intake Form phases. You MUST STOP and wait for the user's response between stages.

TOOL RESTRICTIONS BY PHASE:
- Phase 1 (Qualifying): ONLY present_qualification_questions
- Phase 2 (Recommendation): ONLY suggest_procurement_items (it handles web search internally)
- Phase 3 (Intake Form): ONLY ask_form_questions
- Phase 4 (Confirmation): ONLY create_intake_request

NEVER use search_procurement_catalog, search_online_suppliers, or research_market_price in Phase 2. The suggest_procurement_items tool already searches the web for products.`;

export function registerAgentRoutes(app: Router, getOpenAI: () => OpenAI | null) {
  // Qwen Responses API (for native Web Extractor, Image Search, etc.)
  app.post("/api/agent/responses", requireAuth, async (req, res) => {
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
          model: "qwen3.5-plus-2026-02-15",
          input: input,
          tools: tools || [{ type: "web_search" }, { type: "web_extractor" }],
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

  // Audio transcription via Qwen3.5-Omni
  app.post("/api/agent/transcribe", requireAuth, async (req, res) => {
    const openai = getOpenAI();
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
        new Promise((_, reject) => setTimeout(() => reject(new Error("Transcription timeout")), 30000))
      ]) as any;

      res.json({ text: completion.choices[0].message.content });
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: (error as Error).message || "Failed to transcribe audio" });
    }
  });

  // Main agent chat endpoint — streaming NDJSON with tool-calling loop
  app.post("/api/agent/chat", requireAuth, async (req: Request, res: Response) => {
    const { messages, context, model } = req.body;
    const openai = getOpenAI();

    if (!process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "sk-...") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Transfer-Encoding", "chunked");
      res.write(JSON.stringify({ type: "error", error: "QWEN_API_KEY is missing or invalid. Please update it in the Secrets panel." }) + "\n");
      return res.end();
    }

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");

    try {
      const formattedMessages = messages.map((m: any) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.parts ? m.parts[0].text : m.content,
      }));

      let policyText = "";
      let kbText = "";

      if (context?.knowledgeBase && context.knowledgeBase.length > 0) {
        const policyDocs = context.knowledgeBase.filter((doc: any) => (doc.category || "").toLowerCase() === "policy");
        const referenceDocs = context.knowledgeBase.filter((doc: any) => (doc.category || "").toLowerCase() !== "policy");

        if (policyDocs.length > 0) {
          policyText = "\n\n=== MANDATORY PROCUREMENT POLICIES ===\nThe following policies are ACTIVE and MUST be strictly enforced. NEVER violate these policies. When a user request conflicts with any policy, REFUSE the request, cite the policy by title, and suggest an alternative.\n";
          policyDocs.forEach((doc: any) => {
            const content = (doc.content || "").substring(0, 2000);
            policyText += `\n[${doc.title}]\n${content}\n---\n`;
          });
        }

        if (referenceDocs.length > 0) {
          try {
            const lastUserMessage = formattedMessages.filter((m: any) => m.role === "user").pop();
            const queryText = lastUserMessage?.content || "";
            if (queryText) {
              const queryEmbedding = await generateQueryEmbedding(queryText);
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
          kbText = "\n\n=== KNOWLEDGE BASE REFERENCE ===\n";
          referenceDocs.forEach((doc: any) => {
            const content = (doc.content || "").substring(0, 1500);
            kbText += `\n[${doc.title}]\n${content}\n---\n`;
          });
        }
      }

      let memoryText = "";
      if (context?.agentMemory && context.agentMemory.length > 0) {
        memoryText = "\n\n=== AGENT MEMORY (Past Interactions) ===\nThe following facts have been remembered from previous sessions:\n";
        context.agentMemory.slice(0, 10).forEach((m: any) => {
          memoryText += `\n- [${m.type}] ${m.content}${m.metadata ? ` (${JSON.stringify(m.metadata)})` : ""}`;
        });
        memoryText += "\n\nUse this memory to personalize responses. If the user asks something you already know from memory, reference it directly.";
      }

      if (formattedMessages[0]?.role !== "system") {
        formattedMessages.unshift({
          role: "system",
          content: [
            {
              type: "text",
              text: SYSTEM_PROMPT.replace("=== ACTIVE PROCUREMENT POLICIES ===\n\n=== END OF POLICIES ===", `=== ACTIVE PROCUREMENT POLICIES ===\n${policyText}\n=== END OF POLICIES ===`) + memoryText + kbText,
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

      for (let i = 0; i < 3; i++) {
        if (!openai) throw new Error("OpenAI client not initialized.");

        finalContent = "";
        const toolCallsAccumulator: Record<number, any> = {};

        // Detect current phase and restrict tools accordingly
        const phase = detectPhase(currentMessages);
        const allowedTools = getToolsForPhase(phase);
        console.log(`[Agent] Phase: ${phase}, Allowed tools: ${allowedTools.map(t => t.function.name).join(", ") || "none (text only)"}`);

        const stream = await openai.chat.completions.create({
          model: model || "qwen3.7-max-2026-06-08",
          messages: currentMessages,
          tools: allowedTools.length > 0 ? allowedTools as any : undefined,
          parallel_tool_calls: false,
          max_tokens: 16384,
          stream: true,
          stream_options: { include_usage: true },
          extra_body: {
            enable_search: true,
            enable_thinking: true,
            thinking_budget: 8192,
            preserve_thinking: true,
            search_options: { search_strategy: "agent" }
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
                  toolCallsAccumulator[index] = { id: tc.id, name: tc.function?.name, arguments: "" };
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
          currentMessages.push({
            role: "assistant",
            content: finalContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id, type: "function",
              function: { name: tc.name, arguments: tc.arguments }
            }))
          });

          for (const tc of toolCalls) {
            const args = tc.arguments ? JSON.parse(tc.arguments) : {};
            res.write(JSON.stringify({ type: "tool_start", name: tc.name, arguments: args }) + "\n");
            await new Promise(r => setTimeout(r, 1200));
            const result = await executeToolCall(tc, context, openai);
            toolCallsMade.push({ name: tc.name, arguments: args, result });
            res.write(JSON.stringify({ type: "tool_result", name: tc.name, result }) + "\n");
            currentMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
          }

          const hasInteractiveTool = toolCallsMade.some(tc =>
            tc.name === "present_qualification_questions" ||
            tc.name === "ask_form_questions" ||
            tc.name === "request_approval" ||
            tc.name === "suggest_procurement_items" ||
            tc.name === "suggest_vendors" ||
            tc.name === "create_intake_request" ||
            tc.name === "create_rfq" ||
            tc.name === "create_purchase_order" ||
            tc.name === "create_supplier" ||
            tc.name === "select_bid"
          );
          if (hasInteractiveTool) break;
        } else {
          break;
        }
      }

      // If we have tool results but no text response, ask the model to generate one
      // BUT NOT if interactive tools were used (they handle their own UI)
      const hasInteractiveTool = toolCallsMade.some(tc =>
        tc.name === "present_qualification_questions" ||
        tc.name === "ask_form_questions" ||
        tc.name === "request_approval" ||
        tc.name === "suggest_procurement_items" ||
        tc.name === "suggest_vendors" ||
        tc.name === "create_intake_request" ||
        tc.name === "create_rfq" ||
        tc.name === "create_purchase_order" ||
        tc.name === "create_supplier" ||
        tc.name === "select_bid"
      );
      if (!finalContent && toolCallsMade.length > 0 && openai && !hasInteractiveTool) {
        try {
          const followUp = await openai.chat.completions.create({
            model: model || "qwen3.7-max-2026-06-08",
            messages: [...currentMessages, { role: "user", content: "Based on the tool results above, provide a clear response to the user. Summarize what you found and suggest next steps." }],
            max_tokens: 4096,
          });
          finalContent = followUp.choices[0]?.message?.content || "";
          if (finalContent) {
            res.write(JSON.stringify({ type: "content_delta", delta: finalContent }) + "\n");
          }
        } catch (e) {
          console.error("Follow-up generation failed:", e);
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
}
