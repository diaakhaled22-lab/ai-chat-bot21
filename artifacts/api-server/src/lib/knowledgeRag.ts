import { db, pool, companyKnowledgeFilesTable, companyKnowledgeChunksTable, adminConfigTable, companiesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface RetrievedChunk {
  chunkId: number;
  fileId: number;
  fileName: string;
  chunkIndex: number;
  content: string;
  score: number;
}

/**
 * Ensures the PostgreSQL schema for RAG & Semantic Search exists.
 * Enables pgvector if supported, and creates company_knowledge_chunks table.
 */
export async function ensureRagSchema(): Promise<void> {
  try {
    if (!pool) return;

    // 1. Attempt to enable vector extension (swallow error if PostgreSQL binary does not include pgvector)
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      logger.info("pgvector extension enabled in PostgreSQL");
    } catch {
      logger.info("pgvector extension not present in PG engine; using hybrid JSON vector + lexical indexing");
    }

    // 2. Create chunks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_knowledge_chunks (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        file_id integer NOT NULL REFERENCES company_knowledge_files(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        token_count integer,
        embedding_json text,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      ALTER TABLE company_knowledge_files ADD COLUMN IF NOT EXISTS chunk_count integer DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_chunks_company_id ON company_knowledge_chunks(company_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON company_knowledge_chunks(file_id);
    `);

    // 3. If vector extension exists, add native vector column
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
            ALTER TABLE company_knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
          END IF;
        END $$;
      `);
    } catch {
      // Ignored
    }

    logger.info("RAG Knowledge base schema ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure RAG schema");
  }
}

/**
 * Splits document text into semantic chunks with overlap.
 * Respects paragraph and sentence boundaries for Arabic and English.
 */
export function chunkText(fullText: string, maxChunkChars = 900, overlapChars = 150): string[] {
  if (!fullText || !fullText.trim()) return [];

  const normalized = fullText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
  if (normalized.length <= maxChunkChars) {
    return [normalized.trim()];
  }

  // Split into natural paragraphs / sentence boundaries
  const rawSegments = normalized.split(/(?<=\n\n)|(?<=[.!?؟\n])\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const seg of rawSegments) {
    const trimmedSeg = seg.trim();
    if (!trimmedSeg) continue;

    if (currentChunk.length + trimmedSeg.length + 1 <= maxChunkChars) {
      currentChunk += (currentChunk ? " " : "") + trimmedSeg;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        // Carry forward overlap from the tail of current chunk
        const overlap = currentChunk.slice(-overlapChars);
        currentChunk = overlap + " " + trimmedSeg;
      } else {
        // Segment itself exceeds maxChunkChars — hard slice it
        let start = 0;
        while (start < trimmedSeg.length) {
          chunks.push(trimmedSeg.slice(start, start + maxChunkChars).trim());
          start += maxChunkChars - overlapChars;
        }
        currentChunk = "";
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 20);
}

/**
 * Resolves embedding credentials for a given company.
 */
export async function resolveEmbeddingCredentials(companyId: number): Promise<{
  provider: "openai" | "google" | "none";
  apiKey: string;
}> {
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);

    // 1. Company direct OpenAI / Gemini key
    if (company?.aiAgentApiKey?.trim()) {
      const prov = company.aiProvider || "openai";
      if (prov === "openai" || prov === "google") {
        return { provider: prov as "openai" | "google", apiKey: company.aiAgentApiKey.trim() };
      }
    }

    // 2. Global / env keys
    if (process.env.OPENAI_API_KEY) {
      return { provider: "openai", apiKey: process.env.OPENAI_API_KEY.trim() };
    }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      return { provider: "google", apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!.trim() };
    }

    // 3. Admin config table fallback
    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(inArray(adminConfigTable.key, ["support_ai_api_key", "support_ai_provider", "malfunctions_ai_api_key", "malfunctions_ai_provider"]));
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    if (cfg["support_ai_api_key"] && (cfg["support_ai_provider"] === "openai" || cfg["support_ai_provider"] === "google")) {
      return { provider: cfg["support_ai_provider"] as "openai" | "google", apiKey: cfg["support_ai_api_key"].trim() };
    }
    if (cfg["malfunctions_ai_api_key"] && (cfg["malfunctions_ai_provider"] === "openai" || cfg["malfunctions_ai_provider"] === "google")) {
      return { provider: cfg["malfunctions_ai_provider"] as "openai" | "google", apiKey: cfg["malfunctions_ai_api_key"].trim() };
    }
  } catch (err) {
    logger.warn({ err }, "Could not resolve embedding credentials");
  }

  return { provider: "none", apiKey: "" };
}

/**
 * Generates vector embeddings for a batch of strings.
 */
export async function generateEmbeddings(
  texts: string[],
  creds: { provider: "openai" | "google" | "none"; apiKey: string }
): Promise<(number[] | null)[]> {
  if (creds.provider === "none" || !creds.apiKey || texts.length === 0) {
    return texts.map(() => null);
  }

  try {
    if (creds.provider === "openai") {
      const openai = new OpenAI({ apiKey: creds.apiKey });
      const BATCH_SIZE = 40;
      const results: (number[] | null)[] = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const slice = texts.slice(i, i + BATCH_SIZE);
        const res = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: slice.map((t) => t.slice(0, 8000)), // Safe token length
        });
        for (const item of res.data) {
          results.push(item.embedding);
        }
      }
      return results;
    }

    if (creds.provider === "google") {
      const genAI = new GoogleGenerativeAI(creds.apiKey);
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const results: (number[] | null)[] = [];

      for (const t of texts) {
        try {
          const res = await model.embedContent(t.slice(0, 4000));
          results.push(res.embedding.values || null);
        } catch {
          results.push(null);
        }
      }
      return results;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to generate embeddings, falling back to lexical indexing");
  }

  return texts.map(() => null);
}

/**
 * Indexes all chunks of a knowledge file into the database.
 */
export async function indexKnowledgeFileChunks(
  fileId: number,
  companyId: number,
  fullText: string
): Promise<number> {
  try {
    const chunks = chunkText(fullText);
    if (chunks.length === 0) return 0;

    // Delete any previous chunks for this file
    await db.delete(companyKnowledgeChunksTable).where(eq(companyKnowledgeChunksTable.fileId, fileId));

    const creds = await resolveEmbeddingCredentials(companyId);
    const embeddings = await generateEmbeddings(chunks, creds);

    // Insert chunks in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const chunkSlice = chunks.slice(i, i + BATCH_SIZE);
      const embSlice = embeddings.slice(i, i + BATCH_SIZE);

      await db.insert(companyKnowledgeChunksTable).values(
        chunkSlice.map((content, idx) => {
          const emb = embSlice[idx];
          return {
            companyId,
            fileId,
            chunkIndex: i + idx + 1,
            content,
            tokenCount: Math.ceil(content.length / 4),
            embeddingJson: emb ? JSON.stringify(emb) : null,
          };
        })
      );
    }

    // Update chunk count on file record
    await db
      .update(companyKnowledgeFilesTable)
      .set({ chunkCount: chunks.length })
      .where(eq(companyKnowledgeFilesTable.id, fileId));

    logger.info({ fileId, companyId, chunkCount: chunks.length }, "Knowledge file indexed into RAG chunks");
    return chunks.length;
  } catch (err) {
    logger.error({ err, fileId }, "Failed to index knowledge file chunks");
    return 0;
  }
}

/**
 * Computes Cosine Similarity between two float vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Computes lexical keyword match score between query and chunk text.
 */
function lexicalScore(query: string, content: string): number {
  const queryWords = query
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryWords.length === 0) return 0;

  const contentLower = content.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }
  return matches / queryWords.length;
}

/**
 * Performs Semantic + Hybrid search across a company's knowledge base.
 * Retrieves only the top-K most relevant chunks matching the user's question.
 */
export async function retrieveRelevantKnowledgeChunks(
  companyId: number,
  query: string,
  topK = 4
): Promise<RetrievedChunk[]> {
  if (!query || !query.trim()) return [];

  try {
    // 1. Fetch chunks and their file metadata
    const rows = await db
      .select({
        chunkId: companyKnowledgeChunksTable.id,
        fileId: companyKnowledgeChunksTable.fileId,
        fileName: companyKnowledgeFilesTable.fileName,
        chunkIndex: companyKnowledgeChunksTable.chunkIndex,
        content: companyKnowledgeChunksTable.content,
        embeddingJson: companyKnowledgeChunksTable.embeddingJson,
      })
      .from(companyKnowledgeChunksTable)
      .innerJoin(companyKnowledgeFilesTable, eq(companyKnowledgeChunksTable.fileId, companyKnowledgeFilesTable.id))
      .where(eq(companyKnowledgeChunksTable.companyId, companyId))
      .limit(600); // Safe pool for scoring

    if (rows.length === 0) return [];

    // 2. Generate embedding for user query if vectors are used
    const hasEmbeddings = rows.some((r) => r.embeddingJson);
    let queryEmbedding: number[] | null = null;

    if (hasEmbeddings) {
      const creds = await resolveEmbeddingCredentials(companyId);
      const [emb] = await generateEmbeddings([query.trim()], creds);
      queryEmbedding = emb || null;
    }

    // 3. Score every chunk
    const scored: RetrievedChunk[] = [];

    for (const r of rows) {
      let vecSim: number | null = null;
      if (queryEmbedding && r.embeddingJson) {
        try {
          const chunkVec: number[] = JSON.parse(r.embeddingJson);
          vecSim = cosineSimilarity(queryEmbedding, chunkVec);
        } catch {
          vecSim = null;
        }
      }

      const lexSim = lexicalScore(query, r.content);

      // Hybrid score: 70% vector semantic + 30% lexical keyword
      const combinedScore = vecSim !== null ? vecSim * 0.7 + lexSim * 0.3 : lexSim;

      // Keep chunks with reasonable relevance
      if (combinedScore > 0.05 || (vecSim !== null && vecSim > 0.35)) {
        scored.push({
          chunkId: r.chunkId,
          fileId: r.fileId,
          fileName: r.fileName,
          chunkIndex: r.chunkIndex,
          content: r.content,
          score: Math.round(combinedScore * 100) / 100,
        });
      }
    }

    // Sort by highest score first and take topK
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  } catch (err) {
    logger.error({ err, companyId, query }, "Semantic retrieval error");
    return [];
  }
}

/**
 * Formats retrieved RAG chunks into a structured prompt section for the AI.
 */
export function formatRagPromptSection(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const formatted = chunks
    .map(
      (c, i) =>
        `[${i + 1}] Source: "${c.fileName}" (Section #${c.chunkIndex}) — Relevance: ${Math.round(c.score * 100)}%:\n${c.content}`
    )
    .join("\n\n");

  return `\n\n--- Relevant Knowledge Base (Retrieved via AI Semantic Search / RAG) ---\n${formatted}\n--- End of Relevant Knowledge Base ---\nUse the specific facts from the sources above to give a precise, truthful answer to the customer. If the answer is not contained in the sources, politely inform the customer based on company general info.`;
}
