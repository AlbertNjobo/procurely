# Atlas — AI Procurement Agent

> An autonomous AI agent that handles the full procure-to-pay lifecycle using Qwen Cloud, from intake orchestration to vendor negotiation and payment processing.

**Track:** Autopilot Agent — Qwen Cloud Global AI Hackathon

## What It Does

Atlas is a procurement AI agent that automates real-world business workflows end-to-end. A user describes what they need in natural language, and the agent handles qualification, sourcing, policy enforcement, RFQ creation, bid analysis, and purchase order generation — with human approval at critical decision points.

### Key Features

- **Natural Language Procurement** — "I need 10 laptops for the engineering team under $15K" triggers an autonomous qualification and sourcing flow
- **KB Policy Enforcement** — Knowledge base policies are injected into the system prompt as mandatory rules; the agent refuses non-compliant requests and cites the specific policy
- **Multi-Agent Delegation** — Complex tasks are delegated to specialist sub-agents (risk analyst, bid optimizer, compliance checker) that call separate Qwen models
- **RAG-Powered Knowledge Base** — Documents are chunked, embedded with `text-embedding-v4`, and reranked with `qwen3-rerank` for semantic retrieval
- **Persistent Memory** — Agent remembers user preferences and past decisions across sessions using embeddings
- **Human-in-the-Loop** — Confirmation cards for supplier creation, RFQ submission, bid selection, and purchase orders
- **Vendor Negotiation** — AI-driven market research and counter-offer generation
- **Voice Input** — Audio transcription for hands-free interaction

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                │
│  Dashboard │ Agent Chat │ Suppliers │ RFQs │ KB │ Workflows │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP/SSE
┌──────────────────────────▼──────────────────────────────┐
│                 Express Server (server.ts)                │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Agent Chat   │  │ RAG Pipeline │  │ Tool Execution │  │
│  │ (streaming)  │  │ (search +    │  │ (20+ tools)    │  │
│  │              │  │  rerank)     │  │                │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
└─────────┼─────────────────┼───────────────────┼──────────┘
          │                 │                   │
    ┌─────▼─────┐    ┌─────▼─────┐      ┌──────▼──────┐
    │Qwen Cloud  │    │Qwen Cloud  │      │  Firebase    │
    │qwen3.5-plus│    │embedding-  │      │  Auth +      │
    │(chat +     │    │v4 +        │      │  Firestore   │
    │ tools)     │    │qwen3-rerank│      │              │
    └───────────┘    └───────────┘      └──────────────┘
```

## Qwen Cloud Integration

| Feature | Model | Purpose |
|---------|-------|---------|
| Agent chat | qwen3.5-plus | Main conversational agent with tool calling |
| Specialist agents | qwen3.6-flash | Cost-optimized sub-agent delegation |
| Embeddings | text-embedding-v4 | Document and query vectorization (1024d) |
| Reranking | qwen3-rerank | Cross-attention reranking for RAG precision |
| Web search | enable_search | Real-time supplier/market research |
| Vision | qwen3.5-plus | Invoice OCR and document processing |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your QWEN_API_KEY

# Start development server
npm run dev
```

The app runs at `http://localhost:3000`. Sign in with Firebase Auth. On first login, demo data is auto-seeded.

## Demo Flow

1. **Dashboard** — View spend analytics, recent approvals, procurement pipeline
2. **Agent Chat** — "I want to order a laptop for $20,000" → agent refuses, cites KB policy
3. **Qualification** — "Find me a laptop under $2000" → interactive chips → product cards
4. **Intake Creation** — Agent creates requisition → confirmation card → persists to Firestore
5. **Supplier Directory** — View suppliers with risk badges, compliance status
6. **RFQs & Bids** — RFQ with multiple supplier bids, comparative analysis
7. **Knowledge Base** — Upload policies, toggle KB context for agent
8. **Vendor Negotiation** — AI-driven market research and counter-offers
9. **Workflow Designer** — Visual procurement workflow builder

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, shadcn/ui, React Flow
- **Backend:** Express.js, TypeScript
- **AI:** Qwen Cloud (DashScope compatible API)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication
- **RAG:** text-embedding-v4, qwen3-rerank, cosine similarity search

## License

MIT
