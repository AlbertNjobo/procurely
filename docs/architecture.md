# Procurely Architecture

## System Overview

```mermaid
graph TB
    subgraph Browser["Browser — React + Vite + Tailwind"]
        UI[Dashboard / Agent Chat / Suppliers / RFQs / KB]
    end

    subgraph Alibaba["Alibaba Cloud SAS — Docker"]
        subgraph Docker["Docker Compose"]
            NGINX[Nginx Reverse Proxy<br/>port 80/443]
            subgraph App["Node.js App — server.ts"]
                Agent[Agent Chat Endpoint<br/>streaming NDJSON]
                RAG[RAG Pipeline<br/>Zvec vector search + rerank]
                Tools[Tool Execution<br/>20+ tools]
                Memory[Memory Service<br/>cross-session recall]
            end
        end
        ZVEC[(Zvec<br/>kb_chunks + agent_memories<br/>HNSW vector index)]
    end

    subgraph Cloudflare["Cloudflare — DNS + SSL"]
        DNS[procurely.dpdns.org<br/>proxy + HTTPS]
    end

    subgraph QwenCloud["Qwen Cloud — DashScope API"]
        Chat[qwen3.5-plus<br/>Chat + Tool Calling]
        Embed[text-embedding-v4<br/>1024d Vectors]
        Rerank[qwen3-rerank<br/>Cross-Attention]
        Vision[qwen3.5-plus<br/>Vision / OCR]
        Search[enable_search<br/>Web Research]
    end

    subgraph Firebase["Firebase"]
        Auth[Authentication]
        FS[(Firestore<br/>suppliers / intakes / rfqs<br/>bids / purchaseOrders<br/>knowledgeBase)]
    end

    subgraph Specialist["Specialist Sub-Agents"]
        Risk[Risk Analyst<br/>qwen3.6-flash]
        Bid[Bid Optimizer<br/>qwen3.6-flash]
        Compliance[Compliance Checker<br/>qwen3.6-flash]
    end

    DNS --> NGINX
    NGINX --> Agent
    UI -->|HTTP POST| DNS
    Agent -->|streaming NDJSON| UI
    Agent --> Chat
    Chat -->|tool_calls| Tools
    Tools --> FS
    Tools --> Vision
    Tools --> Search
    RAG --> Embed
    RAG --> Rerank
    Agent --> RAG
    RAG --> ZVEC
    Memory --> ZVEC
    Tools --> Risk
    Tools --> Bid
    Tools --> Compliance
    UI --> Auth
    Auth --> FS
```

## Data Flow — Agent Chat

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant N as Nginx
    participant S as Server
    participant Z as Zvec
    participant Q as Qwen Cloud
    participant DB as Firestore

    U->>F: "I need 10 laptops under $15K"
    F->>N: POST /api/agent/chat
    N->>S: proxy to atlas:3000
    
    Note over S: Inject KB policies into system prompt
    
    S->>Z: Search Zvec for relevant KB chunks
    Z-->>S: Top-5 vector matches
    S->>Q: Rerank chunks with qwen3-rerank
    Q-->>S: Ranked results
    
    S->>Q: Chat completion (streaming)
    Q-->>S: Tool call: present_qualification_questions
    S-->>F: tool_start + tool_result (NDJSON)
    F-->>U: Interactive qualification chips
    
    U->>F: Selects options
    F->>S: POST /api/agent/chat
    S->>Q: Chat completion
    Q-->>S: Tool call: suggest_procurement_items
    S->>Q: Web search for product images
    S-->>F: Product cards with images
    F-->>U: View product recommendations
    
    U->>F: "I'll take the Dell Latitude"
    F->>S: POST /api/agent/chat
    S->>Q: Chat completion
    Q-->>S: Tool call: create_intake_request
    S-->>F: Confirmation card
    U->>F: Click "Confirm & Create"
    F->>DB: addDoc(purchaseRequisitions, ...)
    DB-->>F: docRef.id
    F-->>U: "Requisition REQ-xxx created"
```

## RAG Pipeline (Zvec-powered)

```mermaid
graph LR
    A[User Query] --> B[Generate Query Embedding<br/>text-embedding-v4 1024d]
    B --> C[Vector Search<br/>Zvec HNSW index<br/>COSINE metric]
    C --> D[Top-20 Results<br/>filtered by minScore 0.3]
    D --> E[Rerank with qwen3-rerank<br/>cross-attention scoring]
    E --> F[Top-5 Results<br/>injected into system prompt]
    
    G[KB Documents] --> H[Chunk Text<br/>200 words for policies<br/>500 words for references]
    H --> I[Generate Embeddings<br/>text-embedding-v4 batch]
    I --> J[Store in Zvec<br/>kb_chunks collection<br/>HNSW + inverted index]
    J --> C
```

## Multi-Agent Delegation

```mermaid
graph TB
    Main[Main Agent<br/>qwen3.5-plus] -->|complex analysis| Risk[Risk Analyst<br/>qwen3.6-flash]
    Main -->|bid comparison| Bid[Bid Optimizer<br/>qwen3.6-flash]
    Main -->|policy validation| Comp[Compliance Checker<br/>qwen3.6-flash]
    
    Risk -->|structured JSON| Main
    Bid -->|structured JSON| Main
    Comp -->|structured JSON| Main
    
    Main -->|final response| User[User]
```

## Firestore Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `suppliers` | Supplier directory | name, category, risk, status, compliance |
| `purchaseRequisitions` | Intake requests | title, department, status, totalAmount, auditTrail |
| `rfqs` | Requests for Quotation | title, description, supplierIds, dueDate, status |
| `bids` | Supplier bid responses | rfqId, vendorId, amount, proposal, status |
| `purchaseOrders` | Committed purchases | supplierId, items, totalAmount, status |
| `knowledgeBase` | Policies & documents | title, content, category |
| `users` | User profiles | uid, email, displayName, role |

## Zvec Collections

| Collection | Purpose | Schema |
|------------|---------|--------|
| `kb_chunks` | Knowledge base vectors | docId (STRING, INVERT index), title, text, embedding (FP32 1024d, HNSW COSINE) |
| `agent_memories` | Cross-session memory | userId (STRING, INVERT index), type, content, metadata, embedding (FP32 1024d, HNSW COSINE) |

## Infrastructure

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Domain | procurely.dpdns.org | Free domain via DigitalPlat |
| CDN/SSL | Cloudflare (Flexible) | DNS proxy, HTTPS termination |
| Reverse Proxy | Nginx (Docker) | Port 80/443 → 3000, SSE streaming |
| App Server | Node.js + Express | API routes, agent chat, RAG |
| Vector DB | Zvec (in-process) | HNSW vector search, WAL persistence |
| Database | Firebase Firestore | Structured data, auth, real-time sync |
| AI | Qwen Cloud (DashScope) | Chat, embeddings, reranking, vision, web search |
| Hosting | Alibaba Cloud SAS | Docker container, 2 vCPU, 2 GiB |
