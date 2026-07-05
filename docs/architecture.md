# Atlas Architecture

## System Overview

```mermaid
graph TB
    subgraph Frontend["Frontend — React + Vite + Tailwind"]
        UI[Dashboard / Agent Chat / Suppliers / RFQs / KB]
    end

    subgraph Server["Express Server — server.ts"]
        Agent[Agent Chat Endpoint<br/>streaming SSE]
        RAG[RAG Pipeline<br/>search + rerank]
        Tools[Tool Execution<br/>20+ tools]
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
        FS[(Firestore<br/>suppliers / intakes / rfqs<br/>bids / purchaseOrders<br/>knowledgeBase / agentMemory)]
    end

    subgraph Specialist["Specialist Sub-Agents"]
        Risk[Risk Analyst<br/>qwen3.6-flash]
        Bid[Bid Optimizer<br/>qwen3.6-flash]
        Compliance[Compliance Checker<br/>qwen3.6-flash]
    end

    UI -->|HTTP POST| Agent
    Agent -->|streaming SSE| UI
    Agent --> Chat
    Chat -->|tool_calls| Tools
    Tools --> FS
    Tools --> Vision
    Tools --> Search
    RAG --> Embed
    RAG --> Rerank
    Agent --> RAG
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
    participant S as Server
    participant Q as Qwen Cloud
    participant DB as Firestore

    U->>F: "I need 10 laptops under $15K"
    F->>S: POST /api/agent/chat (messages, context)
    
    Note over S: Inject KB policies into system prompt
    
    S->>Q: Chat completion (streaming)
    Q-->>S: Tool call: present_qualification_questions
    S-->>F: tool_start + tool_result (SSE)
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

## RAG Pipeline

```mermaid
graph LR
    A[User Query] --> B[Generate Query Embedding<br/>text-embedding-v4 1024d]
    B --> C[Cosine Similarity Search<br/>against KB chunks]
    C --> D[Top-K Results<br/>minScore: 0.3]
    D --> E[Rerank with qwen3-rerank<br/>cross-attention scoring]
    E --> F[Top-5 Results<br/>injected into system prompt]
    
    G[KB Documents] --> H[Chunk Text<br/>200 words for policies<br/>500 words for references]
    H --> I[Generate Embeddings<br/>text-embedding-v4 batch]
    I --> J[Store Chunks + Embeddings<br/>in Firestore]
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
| `knowledgeBase` | Policies & documents | title, content, category, chunks (with embeddings) |
| `agentMemory` | Cross-session memory | type, content, embedding, metadata |
