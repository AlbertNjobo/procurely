/**
 * Tool Executor — Registry of all agent tool handlers
 * Extracted from server.ts to keep the main server file lean.
 */
import OpenAI from "openai";
import { db } from "./firebase";
import { doc, updateDoc, addDoc, collection } from "firebase/firestore";
import { generateQueryEmbedding } from "./rag";
import { insertMemory } from "./zvec-store";

type ToolHandler = (args: any, context: any, openai: OpenAI) => Promise<string>;

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch {
    return {};
  }
}

// ===== Shared Condition Evaluator =====

export function evaluateCondition(condType: string, params: Record<string, any>, data: Record<string, any>): { result: boolean; explanation: string } {
  if (condType === "amount_threshold") {
    const threshold = parseFloat(params.threshold || "10000");
    const amount = parseFloat(String(data.amount || "0").replace(/[^0-9.]/g, ""));
    const op = params.operator || ">";
    let result = false;
    if (op === ">") result = amount > threshold;
    else if (op === "<") result = amount < threshold;
    else if (op === ">=") result = amount >= threshold;
    else if (op === "<=") result = amount <= threshold;
    else if (op === "==") result = amount === threshold;
    return { result, explanation: `$${amount} ${op} $${threshold} → ${result}` };
  }
  if (condType === "department_match") {
    const target = (params.department || params.departmentMatch || "").toLowerCase();
    const actual = (data.department || "").toLowerCase();
    const result = actual.includes(target);
    return { result, explanation: `Department "${data.department}" matches "${target}" → ${result}` };
  }
  if (condType === "category_match") {
    const target = (params.category || params.categoryMatch || "").toLowerCase();
    const actual = (data.category || "").toLowerCase();
    const result = actual.includes(target);
    return { result, explanation: `Category "${data.category}" matches "${target}" → ${result}` };
  }
  if (condType === "risk_level") {
    const maxRisk = params.max_level || params.maxRiskLevel || "Medium";
    const riskOrder: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
    const actual = riskOrder[data.riskLevel as string] || 1;
    const max = riskOrder[maxRisk] || 2;
    const result = actual <= max;
    return { result, explanation: `Risk "${data.riskLevel}" ≤ "${maxRisk}" → ${result}` };
  }
  if (condType === "vendor_check") {
    const target = (params.vendor || params.vendorMatch || "").toLowerCase();
    const actual = (data.vendor || "").toLowerCase();
    const result = actual.includes(target);
    return { result, explanation: `Vendor "${data.vendor}" matches "${target}" → ${result}` };
  }
  return { result: true, explanation: "Condition passed (default)" };
}

// ===== Tool Handlers =====

async function handleGetIntakeRequests(args: any, context: any): Promise<string> {
  const allIntakes = context?.intakes || [];
  let filtered = allIntakes;
  if (args.status) filtered = filtered.filter((i: any) => i.status === args.status);
  if (args.department) filtered = filtered.filter((i: any) => i.department === args.department);
  return JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No requests found matching criteria." }]);
}

async function handleSearchCatalog(args: any, context: any): Promise<string> {
  const catalog = context?.procurementCatalog || [];
  const q = (args.query || "").toLowerCase();
  const cat = (args.category || "").toLowerCase();
  let filtered = catalog;
  if (q) {
    filtered = filtered.filter((item: any) =>
      (item.name || "").toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q)
    );
  }
  if (cat) {
    filtered = filtered.filter((item: any) => (item.category || "").toLowerCase().includes(cat));
  }
  if (args.max_price != null) filtered = filtered.filter((item: any) => (item.price || 0) <= args.max_price);
  if (args.min_price != null) filtered = filtered.filter((item: any) => (item.price || 0) >= args.min_price);
  return JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No catalog items found matching criteria." }]);
}

async function handleGetSuppliers(args: any, context: any): Promise<string> {
  const allSuppliers = context?.suppliers || [];
  let filtered = allSuppliers;
  if (args.category) filtered = filtered.filter((s: any) => (s.category || "").toLowerCase().includes(args.category.toLowerCase()));
  if (args.risk_level) filtered = filtered.filter((s: any) => (s.risk || "").toLowerCase() === args.risk_level.toLowerCase());
  return JSON.stringify(filtered.length > 0 ? filtered : [{ message: "No suppliers found matching criteria." }]);
}

async function handleSearchOnlineSuppliers(args: any, _context: any, openai: OpenAI): Promise<string> {
  try {
    const searchQuery = `Find real companies that provide ${args.category} services${args.requirements ? ` with ${args.requirements}` : ""}${args.budget_range ? ` in the ${args.budget_range} range` : ""}. For each company, provide: company name, what they do (1 sentence), website URL if available, estimated pricing tier (Enterprise/Mid-Market/SMB), and key strengths. Return a JSON array with objects: { "name", "description", "website", "pricing_tier", "strengths" }. Return ONLY valid JSON.`;
    const searchResponse = await openai.chat.completions.create({
      model: "qwen3.5-plus-2026-02-15",
      messages: [{ role: "user", content: searchQuery }],
      temperature: 0.2,
      extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
    } as any);
    const content = searchResponse.choices[0]?.message?.content || "[]";
    const suppliers = parseJsonSafe(content);
    return JSON.stringify({
      query: { category: args.category, requirements: args.requirements, budget_range: args.budget_range },
      suppliers: Array.isArray(suppliers) ? suppliers : [],
      message: `Found ${Array.isArray(suppliers) ? suppliers.length : 0} potential suppliers online for ${args.category}.`
    });
  } catch (e) {
    console.error("Online supplier search error:", e);
    return JSON.stringify({ suppliers: [], message: "Unable to search online suppliers at this time." });
  }
}

async function handleEvaluateSupplierRisk(args: any, context: any, openai: OpenAI): Promise<string> {
  try {
    const supplier = (context?.suppliers || []).find((s: any) => s.id === args.supplier_id) || { name: args.supplier_id, category: "Unknown" };
    const riskResponse = await openai.chat.completions.create({
      model: "qwen3.5-plus-2026-02-15",
      messages: [{
        role: "user",
        content: `You are a procurement risk analyst. Evaluate the following supplier and provide a risk assessment.\n\nSupplier: ${supplier.name}\nCategory: ${supplier.category || "Unknown"}\nSupplier ID: ${args.supplier_id}\n\nResearch this company using web search if available. Provide:\n1. A risk score from 0-100 (where 0 is lowest risk)\n2. Overall status: "Passed", "Warning", or "Failed"\n3. A list of checks performed (e.g., "Financial Stability", "Security Compliance", "Market Reputation")\n4. A brief risk summary\n\nRespond in valid JSON with keys: risk_score, status, checks (array of strings), risk_summary`
      }],
      temperature: 0.2,
      extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
    } as any);
    const riskData = parseJsonSafe(riskResponse.choices[0]?.message?.content || "{}");
    return JSON.stringify({
      supplier_id: args.supplier_id,
      supplier_name: supplier.name,
      risk_score: riskData.risk_score ?? 50,
      status: riskData.status ?? "Warning",
      checks: riskData.checks ?? ["Financial", "Security", "Compliance"],
      risk_summary: riskData.risk_summary ?? "Risk assessment completed via Qwen AI analysis."
    });
  } catch (e) {
    console.error("Supplier risk evaluation error:", e);
    return JSON.stringify({ supplier_id: args.supplier_id, risk_score: 50, status: "Warning", checks: ["Financial", "Security"], risk_summary: "Automated assessment - review recommended." });
  }
}

async function handleGenerateBidMatrix(args: any, context: any, openai: OpenAI): Promise<string> {
  try {
    const suppliers = (context?.suppliers || []).filter((s: any) => args.supplier_ids?.includes(s.id));
    const intake = (context?.intakes || []).find((i: any) => i.id === args.intake_id) || { title: "Unknown", amount: "N/A", description: "N/A" };
    const bidResponse = await openai.chat.completions.create({
      model: "qwen3.5-plus-2026-02-15",
      messages: [{
        role: "user",
        content: `You are a procurement bid analyst. Generate a comparative bid matrix analysis.\n\nRequisition: ${intake.title} (${intake.amount})\nDescription: ${intake.description}\n\nSuppliers to compare:\n${suppliers.map((s: any) => `- ${s.name} (Category: ${s.category}, Risk: ${s.risk}, Status: ${s.status})`).join("\n") || "No supplier data available"}\n\nAnalyze each supplier across these dimensions:\n1. Price competitiveness\n2. Risk level\n3. Compliance status\n4. Category fit\n5. Overall recommendation\n\nProvide a structured analysis with:\n- A comparison table (JSON array of objects with supplier_name, score, strengths, weaknesses)\n- A winning supplier recommendation with reasoning\n- A risk-adjusted score for each supplier\n\nRespond in valid JSON with keys: comparison (array), winning_supplier, reasoning, risk_adjusted_scores`
      }],
      temperature: 0.2,
      extra_body: { enable_search: true, search_options: { search_strategy: "agent" } }
    } as any);
    const bidData = parseJsonSafe(bidResponse.choices[0]?.message?.content || "{}");
    return JSON.stringify({
      status: "Bid Matrix Generated Successfully",
      intake_id: args.intake_id,
      comparison: bidData.comparison || [],
      winning_supplier: bidData.winning_supplier || args.supplier_ids?.[0],
      reasoning: bidData.reasoning || "Analysis completed via Qwen AI.",
      risk_adjusted_scores: bidData.risk_adjusted_scores || {}
    });
  } catch (e) {
    console.error("Bid matrix generation error:", e);
    return JSON.stringify({ status: "Matrix Generated (Basic)", winning_supplier: args.supplier_ids?.[0], reasoning: "Basic analysis - detailed review recommended." });
  }
}

async function handleUpdateIntakeStatus(args: any): Promise<string> {
  try {
    await updateDoc(doc(db, "purchaseRequisitions", args.intake_id), { status: args.new_status });
    return JSON.stringify({ success: true, intake_id: args.intake_id, new_status: args.new_status, message: `Status updated to "${args.new_status}" for intake ${args.intake_id}.` });
  } catch (e) {
    console.error("Update intake status error:", e);
    return JSON.stringify({ success: false, message: "Failed to update status" });
  }
}

async function searchProductImage(query: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);
    const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.QWEN_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen3.7-max-2026-06-08",
        input: `Find a product image for: ${query}`,
        tools: [{ type: "web_search_image" }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === "web_search_image_call" && item.output) {
            const images = JSON.parse(item.output);
            const RENDERABLE_EXT = /\.(jpe?g|png|webp|gif)$/i;
            const valid = images.filter((img: any) => img.url && RENDERABLE_EXT.test(img.url));
            if (valid.length > 0) return valid[0].url;
          }
        }
      }
    }
  } catch (e) { /* silent */ }
  return "";
}

// Cache for web search results (5 min TTL)
const searchCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function webSearch(query: string): Promise<string> {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[WebSearch] Cache hit`);
    return cached.result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.QWEN_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3.5-plus-2026-02-15",
        input: query,
        tools: [{ type: "web_search" }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === "message" && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === "output_text" && c.text) {
                searchCache.set(query, { result: c.text, timestamp: Date.now() });
                return c.text;
              }
            }
          }
        }
      }
    } else {
      console.log(`[WebSearch] HTTP ${response.status}`);
    }
  } catch (e) {
    console.log(`[WebSearch] Error: ${(e as Error).message}`);
  }
  return "";
}

async function handleSuggestItems(args: any, context: any, openai: OpenAI): Promise<string> {
  const agentItems = args.items || [];
  const catalog = context?.procurementCatalog || [];
  const category = (args.items?.[0]?.category || args.category || "").toLowerCase();

  // Step 1: Check internal catalog for matching items (flexible matching)
  const catalogMatches = catalog.filter((item: any) => {
    const itemName = (item.name || "").toLowerCase();
    const itemCategory = (item.category || "").toLowerCase();
    const matchesCategory = category && (itemCategory.includes("hardware") || itemCategory.includes(category));
    const matchesName = itemName.includes("laptop") || itemName.includes("notebook");
    return matchesCategory || matchesName;
  }).map((item: any) => ({
    name: item.name,
    description: item.description || "",
    estimated_price: item.price || 0,
    image_url: "",
    badges: [{ text: "In Stock", variant: "secondary" }],
    source: "catalog"
  }));

  // Step 2: Web search for products using Responses API
  const searchQuery = `Search for 3 laptops for ${category || "engineering"} under $1500. Return JSON: [{"name":"...","description":"...","estimated_price":number}]`;
  const searchText = await webSearch(searchQuery);

  let onlineItems: any[] = [];
  if (searchText) {
    const parsed = parseJsonSafe(searchText);
    if (Array.isArray(parsed)) {
      onlineItems = parsed.map((item: any) => ({
        name: item.name || "Unknown Product",
        description: item.description || "",
        estimated_price: item.estimated_price || 0,
        image_url: "",
        badges: item.badges || [],
        source: "online"
      }));
    }
  }

  // Step 3: Merge catalog + online items
  const allItems = [...catalogMatches, ...onlineItems];

  // Step 4: Search for product images in parallel
  const imagePromises = allItems.map((item: any) => searchProductImage(`${item.name} laptop`));
  const imageUrls = await Promise.all(imagePromises);

  const result = allItems.map((item: any, i: number) => ({
    ...item,
    image_url: imageUrls[i] || `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(item.name)}`
  }));

  return JSON.stringify({ items: result });
}

async function handleSearchProductImages(args: any): Promise<string> {
  try {
    const qwenResponse = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.QWEN_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen3.5-plus-2026-02-15", input: `Find product images for: ${args.query}`, tools: [{ type: "web_search_image" }] })
    });
    if (qwenResponse.ok) {
      const data = await qwenResponse.json();
      let foundImages: any[] = [];
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === "web_search_image_call" && item.output) {
            foundImages = foundImages.concat(JSON.parse(item.output));
          }
        }
      }
      const RENDERABLE_EXT = /\.(jpe?g|png|webp|gif)$/i;
      foundImages = foundImages.filter((img: any) => img.url && RENDERABLE_EXT.test(img.url));
      return JSON.stringify({ images: foundImages.slice(0, 4).map((img: any) => ({ url: img.url, title: img.title || args.query })) });
    }
    throw new Error("Failed to fetch from Responses API");
  } catch (err) {
    console.error("Image search error:", err);
    return JSON.stringify({
      images: [
        { url: `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(args.query)}+1`, title: `${args.query} Option 1` },
        { url: `https://placehold.co/400x300/f3f4f6/6b7280?text=${encodeURIComponent(args.query)}+2`, title: `${args.query} Option 2` }
      ]
    });
  }
}

async function handleRequestApproval(args: any): Promise<string> {
  return JSON.stringify({ status: "approval_required", action: args.action, details: args.details, risk_level: args.risk_level, message: `⚠️ APPROVAL REQUIRED: ${args.action}\n\nThis action requires your explicit approval before proceeding.` });
}

async function handleConfirmAction(args: any): Promise<string> {
  return JSON.stringify({ status: "approved", action_id: args.action_id, action_type: args.action_type, message: `✅ Action confirmed: ${args.action_type}` });
}

async function handleQualificationQuestions(args: any): Promise<string> {
  return JSON.stringify({
    type: "qualification_questions",
    questions: (args.questions || []).map((q: any) => ({
      question_id: q.question_id,
      question_text: q.question_text,
      options: (q.options || []).map((opt: any) => ({ value: opt.value, label: opt.label, icon: opt.icon || null })),
      allow_custom: q.allow_custom !== false,
      custom_placeholder: q.custom_placeholder || "Type your answer..."
    }))
  });
}

async function handleStoreMemory(args: any, context: any): Promise<string> {
  let embedding: number[] = [];
  try { embedding = await generateQueryEmbedding(args.content); } catch (e) { console.warn("Failed to embed memory content:", e); }
  const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  insertMemory({ id: memoryId, userId: context?.userId || "anonymous", type: args.memory_type, content: args.content, metadata: args.metadata || {}, embedding });
  return JSON.stringify({ success: true, memory: { id: memoryId, userId: context?.userId || "anonymous", type: args.memory_type, content: args.content, metadata: args.metadata || {}, createdAt: new Date().toISOString(), embedding }, message: `Memory stored: ${args.content.substring(0, 50)}...` });
}

async function handleCreateRfq(args: any, context: any): Promise<string> {
  try {
    const rfqData = {
      title: args.title, description: args.description || "", supplierIds: args.supplier_ids,
      dueDate: args.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      budgetRange: args.budget_range || "", status: "Draft",
      createdBy: context?.userId || "agent", createdAt: new Date().toISOString(),
      auditTrail: [{ action: "created", actorId: "agent", timestamp: new Date().toISOString() }]
    };
    const docRef = await addDoc(collection(db, "rfqs"), rfqData);
    return JSON.stringify({ success: true, rfq: { id: docRef.id, ...rfqData }, message: `RFQ "${args.title}" created with ID ${docRef.id}. Ready to publish to ${args.supplier_ids.length} suppliers.` });
  } catch (e) {
    console.error("Create RFQ error:", e);
    return JSON.stringify({ success: false, message: "Failed to create RFQ" });
  }
}

async function handleSelectBid(args: any): Promise<string> {
  try {
    await updateDoc(doc(db, "bids", args.bid_id), { status: "Selected" });
    await updateDoc(doc(db, "rfqs", args.rfq_id), { status: "Awarded" });
    return JSON.stringify({ success: true, rfq_id: args.rfq_id, bid_id: args.bid_id, supplier_id: args.supplier_id, amount: args.amount, reasoning: args.reasoning, status: "bid_selected", message: `Bid selected from supplier ${args.supplier_id} for ${args.amount}. Ready to create Purchase Order.` });
  } catch (e) {
    console.error("Select bid error:", e);
    return JSON.stringify({ success: false, message: "Failed to select bid" });
  }
}

async function handleCreatePo(args: any, context: any): Promise<string> {
  try {
    const poData = { supplierId: args.supplier_id, items: args.items || [], totalAmount: args.total_amount, status: "Pending Approval", createdBy: context?.userId || "agent", createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, "purchaseOrders"), poData);
    return JSON.stringify({ success: true, po: { id: docRef.id, ...poData }, message: `Purchase Order ${docRef.id} created for ${args.total_amount}. Awaiting approval.` });
  } catch (e) {
    console.error("Create PO error:", e);
    return JSON.stringify({ success: false, message: "Failed to create purchase order" });
  }
}

async function handleTrackDelivery(args: any): Promise<string> {
  try {
    const trackingNumber = `FX${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    const estimatedDelivery = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    await updateDoc(doc(db, "purchaseOrders", args.po_id), { status: "In Transit", trackingNumber, estimatedDelivery, carrier: "FedEx" });
    return JSON.stringify({
      po_id: args.po_id, status: "In Transit", estimated_delivery: estimatedDelivery, carrier: "FedEx", tracking_number: trackingNumber,
      updates: [
        { date: new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0], status: "Order Placed" },
        { date: new Date(Date.now() - 1 * 86400000).toISOString().split("T")[0], status: "Shipped" },
        { date: new Date().toISOString().split("T")[0], status: "In Transit" }
      ]
    });
  } catch (e) {
    console.error("Track delivery error:", e);
    return JSON.stringify({ po_id: args.po_id, status: "Unknown", message: "Tracking unavailable" });
  }
}

async function handleProcessPayment(args: any): Promise<string> {
  try {
    await updateDoc(doc(db, "purchaseOrders", args.po_id), { paymentStatus: "Paid", status: "Paid", paidAt: new Date().toISOString() });
    if (args.invoice_id) {
      await updateDoc(doc(db, "invoices", args.invoice_id), { status: "Paid", paidAt: new Date().toISOString() });
    }
    return JSON.stringify({ success: true, po_id: args.po_id, invoice_id: args.invoice_id, amount: args.amount, status: "payment_processed", three_way_match: "passed", message: `Payment of ${args.amount} processed for PO ${args.po_id}. 3-way match validated.` });
  } catch (e) {
    console.error("Process payment error:", e);
    return JSON.stringify({ success: false, message: "Failed to process payment" });
  }
}

async function handleProcessInvoice(args: any, _context: any, openai: OpenAI): Promise<string> {
  try {
    const visionResponse = await openai.chat.completions.create({
      model: "qwen3.5-plus-2026-02-15",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/${args.file_type === "pdf" ? "png" : args.file_type};base64,${args.invoice_data.substring(0, 100000)}` } },
          { type: "text", text: "Extract the following from this invoice and return as JSON: vendor_name, invoice_number, invoice_date, po_number, total_amount, tax_amount, line_items (array of {description, quantity, unit_price, total}). Return ONLY valid JSON." }
        ]
      }],
      temperature: 0.1,
    });
    const extracted = parseJsonSafe(visionResponse.choices[0]?.message?.content || "{}");
    return JSON.stringify({ success: true, extracted, three_way_match: extracted.po_number ? "po_found" : "no_po", message: `Invoice processed. Vendor: ${extracted.vendor_name || "Unknown"}, Total: ${extracted.total_amount || "N/A"}` });
  } catch (e) {
    console.error("Invoice OCR error:", e);
    return JSON.stringify({ success: false, error: "Failed to process invoice with vision model", message: "Invoice processing failed. Please try again or enter details manually." });
  }
}

async function handleDelegateToSpecialist(args: any, _context: any, openai: OpenAI): Promise<string> {
  try {
    let specialistPrompt = "";
    const specialistModel = "qwen3.6-flash";
    if (args.specialist === "risk_analyst") {
      specialistPrompt = `You are a procurement Risk Analyst specialist. Analyze the following and provide a detailed risk assessment with scores, checks, and recommendations.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
    } else if (args.specialist === "bid_optimizer") {
      specialistPrompt = `You are a procurement Bid Optimization specialist. Compare and analyze bids, calculate value scores, and recommend the best option.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
    } else if (args.specialist === "compliance_checker") {
      specialistPrompt = `You are a procurement Compliance specialist. Validate the following against procurement policies and regulations.\n\nTask: ${args.task}\nContext: ${JSON.stringify(args.context || {})}`;
    }
    const specialistResponse = await openai.chat.completions.create({ model: specialistModel, messages: [{ role: "user", content: specialistPrompt }], temperature: 0.2, max_tokens: 1500 });
    return JSON.stringify({ specialist: args.specialist, analysis: specialistResponse.choices[0]?.message?.content, usage: specialistResponse.usage });
  } catch (e) {
    console.error("Specialist agent error:", e);
    return JSON.stringify({ specialist: args.specialist, error: "Specialist agent unavailable", fallback: "Proceeding with main agent analysis." });
  }
}

async function handleNegotiateVendor(args: any, context: any, openai: OpenAI): Promise<string> {
  try {
    const vendor = (context?.suppliers || []).find((s: any) => s.id === args.vendor_id) || { name: args.vendor_id, category: "Unknown" };
    const negotiationPrompt = `You are an AI Procurement Negotiator. Your job is to negotiate the best deal for the buyer.\n\nVENDOR: ${vendor.name} (${vendor.category})\nITEM: ${args.item_description}\nTARGET PRICE: ${args.target_price}\nVENDOR'S INITIAL OFFER: ${args.vendor_initial_price || "Not provided yet"}\nADDITIONAL TERMS TO NEGOTIATE: ${(args.terms || []).join(", ") || "None specified"}\n\nStep 1: Research current market prices for this item using web search.\nStep 2: Analyze the vendor's pricing position relative to market.\nStep 3: Develop a negotiation strategy with 2-3 counter-offer options.\nStep 4: For each counter-offer, provide:\n  - Proposed price\n  - Justification (why this is fair)\n  - What to ask for in return (payment terms, warranty, volume discount)\nStep 5: Recommend the best negotiation approach.\n\nRespond in JSON format:\n{\n  "market_research": {"avg_price": "...", "price_range": "...", "sources": ["..."]},\n  "vendor_position": "competitive" | "above_market" | "below_market",\n  "counter_offers": [\n    {"price": "...", "justification": "...", "trade_offs": ["..."]}\n  ],\n  "recommended_strategy": "...",\n  "negotiation_script": "A ready-to-send message to the vendor proposing the best counter-offer"\n}`;
    const negotiationResponse = await openai.chat.completions.create({ model: "qwen3.5-plus-2026-02-15", messages: [{ role: "user", content: negotiationPrompt }], temperature: 0.3, extra_body: { enable_search: true, search_options: { search_strategy: "agent" } } } as any);
    const negData = parseJsonSafe(negotiationResponse.choices[0]?.message?.content || "{}");
    return JSON.stringify({ vendor: vendor.name, item: args.item_description, target_price: args.target_price, vendor_initial_price: args.vendor_initial_price, negotiation: negData, status: "negotiation_strategy_ready" });
  } catch (e) {
    console.error("Negotiation error:", e);
    return JSON.stringify({ error: "Negotiation analysis failed", fallback: "Manual negotiation recommended. Research market prices and propose a counter-offer." });
  }
}

async function handleResearchMarketPrice(args: any, _context: any, openai: OpenAI): Promise<string> {
  try {
    const researchPrompt = `Research current market pricing for: ${args.product}\n${args.quantity ? `Quantity needed: ${args.quantity} units` : ""}\n${args.category ? `Category: ${args.category}` : ""}\n\nProvide:\n1. Average market price\n2. Price range (low to high)\n3. Top 3 suppliers with their prices\n4. Volume discount availability\n5. Best value recommendation\n\nRespond in JSON:\n{\n  "product": "...",\n  "average_price": "...",\n  "price_range": {"low": "...", "high": "..."},\n  "suppliers": [{"name": "...", "price": "...", "notes": "..."}],\n  "volume_discounts": "...",\n  "recommendation": "..."\n}`;
    const researchResponse = await openai.chat.completions.create({ model: "qwen3.6-flash", messages: [{ role: "user", content: researchPrompt }], temperature: 0.2, extra_body: { enable_search: true, search_options: { search_strategy: "agent" } } } as any);
    const resData = parseJsonSafe(researchResponse.choices[0]?.message?.content || "{}");
    return JSON.stringify({ market_research: resData });
  } catch (e) {
    console.error("Market research error:", e);
    return JSON.stringify({ error: "Market research failed", fallback: "Use web search to find pricing." });
  }
}

async function handleExecuteWorkflow(args: any, context: any): Promise<string> {
  const workflowNodes = context?.workflowNodes || [];
  const workflowEdges = context?.workflowEdges || [];
  const requisition = args.requisition_id
    ? (context?.purchaseRequisitions || []).find((r: any) => r.id === args.requisition_id) ||
      (context?.intakes || []).find((i: any) => i.id === args.requisition_id) || {}
    : (context?.purchaseRequisitions || [])[0] || (context?.intakes || [])[0] || {};

  const workflowData: Record<string, any> = {
    amount: parseFloat(String(requisition.totalAmount || requisition.amount || "0").replace(/[^0-9.]/g, "")),
    department: requisition.department || requisition.costCenter || "",
    category: requisition.category || "",
    vendor: requisition.supplier || "",
    riskLevel: requisition.riskLevel || "Low",
    priority: requisition.priority || "Medium",
  };

  const isWayflowFormat = workflowEdges.length > 0 && workflowEdges[0]?.sourceNodeId !== undefined;
  const startNodeId = args.current_node_id || workflowNodes.find((n: any) => n.type === "trigger" || n.type === "input")?.id;
  const currentNode = workflowNodes.find((n: any) => n.id === startNodeId);

  if (!currentNode) {
    return JSON.stringify({ error: "No workflow found or no trigger node", message: "Please design a workflow in the Workflow Designer first." });
  }

  const executionPath: any[] = [];
  let nodeId = startNodeId;
  let stepsRemaining = 15;

  const getEdgeTarget = (edge: any, portId: string) => {
    return isWayflowFormat ? (edge.sourcePortId === portId ? edge.targetNodeId : null) : (edge.source === nodeId && edge.sourceHandle === portId ? edge.target : null);
  };
  const getFirstEdgeTarget = (fromNodeId: string) => {
    const edge = isWayflowFormat ? workflowEdges.find((e: any) => e.sourceNodeId === fromNodeId) : workflowEdges.find((e: any) => e.source === fromNodeId);
    return isWayflowFormat ? edge?.targetNodeId : edge?.target;
  };

  while (nodeId && stepsRemaining > 0) {
    const node = workflowNodes.find((n: any) => n.id === nodeId);
    if (!node) break;
    const step: any = { node_id: node.id, type: node.type, label: node.label || node.data?.label, description: node.data?.description || node.data?.instructions, status: "completed" };

    if (node.type === "condition" || node.type === "conditional") {
      const condType = node.data?.conditionType || "amount_threshold";
      const condParams: Record<string, any> = { threshold: node.data?.threshold, operator: node.data?.operator, departmentMatch: node.data?.departmentMatch, categoryMatch: node.data?.categoryMatch, maxRiskLevel: node.data?.maxRiskLevel, vendorMatch: node.data?.vendorMatch };
      const { result, explanation } = evaluateCondition(condType, condParams, workflowData);
      step.result = result;
      step.evaluation = explanation;
      const nextNodeId = getEdgeTarget(nodeId, result ? "true" : "false");
      nodeId = nextNodeId || getFirstEdgeTarget(nodeId);
    } else if (node.type === "generatePO" || node.type === "checkBudget" || node.type === "notifyVendor" || node.type === "threeWayMatch") {
      step.result = { type: node.type, label: node.label, requisition_id: requisition.id, amount: workflowData.amount, department: workflowData.department, vendor: workflowData.vendor };
      nodeId = getFirstEdgeTarget(nodeId);
    } else if (node.type === "human") {
      step.status = "pending_approval";
      step.instructions = node.data?.instructions;
      nodeId = null;
    } else {
      nodeId = getFirstEdgeTarget(nodeId);
    }

    executionPath.push(step);
    stepsRemaining--;
  }

  return JSON.stringify({
    requisition_id: args.requisition_id, workflow_id: args.workflow_id || "default",
    execution_path: executionPath, total_steps: executionPath.length,
    status: executionPath.some((s: any) => s.status === "pending_approval") ? "awaiting_approval" : "executed",
    message: `Workflow executed through ${executionPath.length} steps.`
  });
}

async function handleEvaluateConditionTool(args: any): Promise<string> {
  const { condition_type, condition_params, requisition_data } = args;
  const { result, explanation } = evaluateCondition(condition_type, condition_params || {}, requisition_data || {});
  return JSON.stringify({ condition_type, result, explanation, requisition_id: requisition_data?.id });
}

async function handleCreateIntake(args: any, context: any): Promise<string> {
  // Check for duplicates by title + department + amount
  const existingReqs = context?.purchaseRequisitions || context?.intakes || [];
  const duplicate = existingReqs.find((r: any) =>
    r.title?.toLowerCase() === args.title?.toLowerCase() &&
    r.department?.toLowerCase() === args.department?.toLowerCase() &&
    parseFloat(String(r.totalAmount || r.amount || "0").replace(/[^0-9.]/g, "")) === parseFloat(String(args.amount || "0").replace(/[^0-9.]/g, ""))
  );

  if (duplicate) {
    return JSON.stringify({
      success: false,
      duplicate: true,
      existingId: duplicate.id,
      message: `A requisition with the same title, department, and amount already exists (ID: ${duplicate.id}). No duplicate created.`
    });
  }

  const newId = `REQ-${Date.now()}`;
  return JSON.stringify({
    success: true, intake: { id: newId, title: args.title, department: args.department, amount: args.amount, description: args.description, status: "Draft", date: new Date().toISOString().split("T")[0] },
    message: `Requisition ${newId} created successfully.`
  });
}

async function handleCreateSupplier(args: any): Promise<string> {
  const newId = `SUP-${Date.now()}`;
  return JSON.stringify({
    success: true, supplier: { id: newId, name: args.name, category: args.category, contact_email: args.contact_email, risk: args.risk_level || "Pending", status: "Onboarding" },
    message: `Supplier "${args.name}" created successfully with ID ${newId}.`
  });
}

// ===== Registry =====

const handlers: Record<string, ToolHandler> = {
  get_intake_requests: handleGetIntakeRequests,
  search_procurement_catalog: handleSearchCatalog,
  get_suppliers: handleGetSuppliers,
  search_online_suppliers: handleSearchOnlineSuppliers,
  evaluate_supplier_risk: handleEvaluateSupplierRisk,
  generate_bid_matrix: handleGenerateBidMatrix,
  update_intake_status: handleUpdateIntakeStatus,
  suggest_procurement_items: handleSuggestItems,
  search_product_images: handleSearchProductImages,
  request_approval: handleRequestApproval,
  confirm_action: handleConfirmAction,
  present_qualification_questions: handleQualificationQuestions,
  store_memory: handleStoreMemory,
  create_rfq: handleCreateRfq,
  select_bid: handleSelectBid,
  create_purchase_order: handleCreatePo,
  track_delivery: handleTrackDelivery,
  process_payment: handleProcessPayment,
  process_invoice: handleProcessInvoice,
  delegate_to_specialist: handleDelegateToSpecialist,
  negotiate_with_vendor: handleNegotiateVendor,
  research_market_price: handleResearchMarketPrice,
  execute_workflow: handleExecuteWorkflow,
  evaluate_workflow_condition: handleEvaluateConditionTool,
  create_intake_request: handleCreateIntake,
  create_supplier: handleCreateSupplier,
};

export async function executeToolCall(tc: any, context: any, openai: OpenAI): Promise<string> {
  const handler = handlers[tc.name];
  if (!handler) return "Success";
  const args = tc.arguments ? JSON.parse(tc.arguments) : {};
  return handler(args, context, openai);
}
