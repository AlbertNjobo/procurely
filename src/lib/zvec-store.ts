import { ZVecCreateAndOpen, ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecMetricType } from "@zvec/zvec";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.ZVEC_DATA_DIR || path.join(process.cwd(), "data", "zvec");

let kbCollection: any = null;
let memoryCollection: any = null;

// ============================================================================
// Initialize Zvec collections on server start
// ============================================================================
export function initZvecStore() {
  try {
    // If data dir exists from a previous schema, remove it to avoid conflicts
    if (fs.existsSync(DATA_DIR)) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      console.log("[Zvec] Cleared old data directory for fresh schema");
    }

    const kbSchema = new ZVecCollectionSchema({
      name: "kb_chunks",
      fields: [
        { name: "docId", dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
        { name: "title", dataType: ZVecDataType.STRING },
        { name: "text", dataType: ZVecDataType.STRING },
      ],
      vectors: [{
        name: "embedding",
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: 1024,
        indexParams: { indexType: ZVecIndexType.HNSW, metricType: ZVecMetricType.COSINE },
      }],
    });
    kbCollection = ZVecCreateAndOpen(path.join(DATA_DIR, "kb"), kbSchema);

    const memSchema = new ZVecCollectionSchema({
      name: "agent_memories",
      fields: [
        { name: "userId", dataType: ZVecDataType.STRING, indexParams: { indexType: ZVecIndexType.INVERT } },
        { name: "type", dataType: ZVecDataType.STRING },
        { name: "content", dataType: ZVecDataType.STRING },
        { name: "metadata", dataType: ZVecDataType.STRING },
      ],
      vectors: [{
        name: "embedding",
        dataType: ZVecDataType.VECTOR_FP32,
        dimension: 1024,
        indexParams: { indexType: ZVecIndexType.HNSW, metricType: ZVecMetricType.COSINE },
      }],
    });
    memoryCollection = ZVecCreateAndOpen(path.join(DATA_DIR, "memories"), memSchema);

    console.log("[Zvec] Collections initialized at", DATA_DIR);
  } catch (e) {
    console.error("[Zvec] Failed to initialize:", e);
  }
}

// ============================================================================
// Knowledge Base: Insert document chunks
// ============================================================================
export function insertChunks(
  chunks: Array<{ docId: string; title: string; text: string; embedding: number[] }>
) {
  if (!kbCollection) return;

  const docs = chunks.map((c, i) => ({
    id: `${c.docId}_chunk_${i}`,
    vectors: { embedding: c.embedding },
    fields: {
      docId: c.docId,
      title: c.title,
      text: c.text,
    },
  }));

  kbCollection.insertSync(docs);
  kbCollection.optimizeSync();
}

// ============================================================================
// Knowledge Base: Search chunks by vector similarity
// ============================================================================
export function searchChunks(
  queryEmbedding: number[],
  topK: number = 5,
  minScore: number = 0.3,
  excludeDocIds?: string[]
): Array<{ text: string; docId: string; title: string; score: number }> {
  if (!kbCollection) return [];

  const results = kbCollection.querySync({
    fieldName: "embedding",
    vector: queryEmbedding,
    topk: Math.max(topK * 3, 20),
  });

  return results
    .filter((r: any) => {
      if (r.score < minScore) return false;
      if (excludeDocIds && excludeDocIds.length > 0) {
        if (excludeDocIds.includes(r.fields?.docId)) return false;
      }
      return true;
    })
    .slice(0, topK)
    .map((r: any) => ({
      text: r.fields?.text || "",
      docId: r.fields?.docId || "",
      title: r.fields?.title || "",
      score: r.score,
    }));
}

// ============================================================================
// Knowledge Base: Delete all chunks for a document
// ============================================================================
export function deleteDocChunks(docId: string) {
  if (!kbCollection) return;
  kbCollection.deleteByFilterSync(`docId == "${docId}"`);
}

// ============================================================================
// Agent Memory: Store a memory entry
// ============================================================================
export function insertMemory(
  memory: { id: string; userId: string; type: string; content: string; metadata?: any; embedding: number[] }
) {
  if (!memoryCollection) return;

  memoryCollection.insertSync([{
    id: memory.id,
    vectors: { embedding: memory.embedding },
    fields: {
      userId: memory.userId,
      type: memory.type,
      content: memory.content,
      metadata: JSON.stringify(memory.metadata || {}),
    },
  }]);
}

// ============================================================================
// Agent Memory: Search memories by vector similarity
// ============================================================================
export function searchMemories(
  userId: string,
  queryEmbedding: number[],
  topK: number = 5,
  memoryType?: string
): Array<{ type: string; content: string; metadata: any; score: number }> {
  if (!memoryCollection) return [];

  const results = memoryCollection.querySync({
    fieldName: "embedding",
    vector: queryEmbedding,
    topk: Math.max(topK * 2, 10),
  });

  return results
    .filter((r: any) => {
      if (r.fields?.userId !== userId) return false;
      if (memoryType && memoryType !== "all" && r.fields?.type !== memoryType) return false;
      return true;
    })
    .slice(0, topK)
    .map((r: any) => ({
      type: r.fields?.type || "",
      content: r.fields?.content || "",
      metadata: (() => { try { return JSON.parse(r.fields?.metadata || "{}"); } catch { return {}; } })(),
      score: r.score,
    }));
}
