import { Types } from "mongoose";
import OpenAI from "openai";
import { config } from "../../config.js";
import { VECTOR_INDEX_NAME } from "../../config/vault.js";
import { DocumentChunk } from "../../models/vault/DocumentChunk.js";
import { VaultDocument } from "../../models/vault/Document.js";
import { embedQuery, isEmbeddingConfigured } from "./embedding.service.js";
import { AppError } from "../../utils/errors.js";

export interface SemanticSearchResult {
  documentId: string;
  documentTitle: string;
  chunkText: string;
  chunkIndex: number;
  pageNumber: number | null;
  score: number;
  secureUrl: string;
  sourceType: string;
}

export interface AskResponse {
  query: string;
  results: SemanticSearchResult[];
  answer: string | null;
}

interface VectorSearchHit {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  text: string;
  pageNumber?: number;
  sourceType: string;
  score: number;
}

async function vectorSearch(
  userId: string,
  queryEmbedding: number[],
  options: { folderId?: string; documentId?: string; limit?: number },
): Promise<VectorSearchHit[]> {
  const filter: Record<string, Types.ObjectId> = {
    userId: new Types.ObjectId(userId),
  };
  if (options.folderId) filter.folderId = new Types.ObjectId(options.folderId);
  if (options.documentId) filter.documentId = new Types.ObjectId(options.documentId);

  const pipeline = [
    {
      $vectorSearch: {
        index: config.vectorSearchIndexName || VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: config.vectorSearchNumCandidates,
        limit: options.limit ?? config.vectorSearchLimit,
        filter,
      },
    },
    {
      $project: {
        documentId: 1,
        chunkIndex: 1,
        text: 1,
        pageNumber: 1,
        sourceType: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  return DocumentChunk.aggregate(pipeline);
}

async function keywordFallback(
  userId: string,
  query: string,
  limit: number,
): Promise<SemanticSearchResult[]> {
  const docs = await VaultDocument.find(
    {
      userId: new Types.ObjectId(userId),
      status: "ready",
      $text: { $search: query },
    },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limit);

  return docs.map((doc) => ({
    documentId: doc._id.toString(),
    documentTitle: doc.title,
    chunkText: (doc.extractedText ?? "").slice(0, 500),
    chunkIndex: 0,
    pageNumber: null,
    score: 0,
    secureUrl: doc.secureUrl,
    sourceType: doc.sourceType,
  }));
}

async function generateAnswer(query: string, results: SemanticSearchResult[]): Promise<string | null> {
  if (!config.openaiApiKey || results.length === 0) return null;

  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const context = results
    .map(
      (r, i) =>
        `[${i + 1}] Document: ${r.documentTitle}\n${r.chunkText}`,
    )
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: config.chatModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using only the provided document excerpts. Cite sources as [1], [2], etc. If the context is insufficient, say so clearly.",
      },
      {
        role: "user",
        content: `Question: ${query}\n\nContext:\n${context}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? null;
}

export async function askVault(
  userId: string,
  query: string,
  options?: {
    folderId?: string;
    documentId?: string;
    limit?: number;
    generateAnswer?: boolean;
  },
): Promise<AskResponse> {
  if (!isEmbeddingConfigured()) {
    throw new AppError(503, "Semantic search requires OPENAI_API_KEY");
  }

  const limit = options?.limit ?? config.vectorSearchLimit;
  const queryEmbedding = await embedQuery(query);

  let hits: VectorSearchHit[] = [];
  try {
    hits = await vectorSearch(userId, queryEmbedding, {
      folderId: options?.folderId,
      documentId: options?.documentId,
      limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("$vectorSearch") || message.includes("vector")) {
      throw new AppError(
        503,
        "MongoDB Atlas vector index is not configured. See backend/docs/vault-api.md",
      );
    }
    throw err;
  }

  const documentIds = [...new Set(hits.map((h) => h.documentId.toString()))];
  const documents = await VaultDocument.find({
    _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
  });
  const docMap = new Map(documents.map((d) => [d._id.toString(), d]));

  let results: SemanticSearchResult[] = hits.map((hit) => {
    const doc = docMap.get(hit.documentId.toString());
    return {
      documentId: hit.documentId.toString(),
      documentTitle: doc?.title ?? "Unknown document",
      chunkText: hit.text,
      chunkIndex: hit.chunkIndex,
      pageNumber: hit.pageNumber ?? null,
      score: hit.score,
      secureUrl: doc?.secureUrl ?? "",
      sourceType: hit.sourceType,
    };
  });

  if (results.length === 0) {
    results = await keywordFallback(userId, query, limit);
  }

  const answer =
    options?.generateAnswer === true
      ? await generateAnswer(query, results)
      : null;

  return { query, results, answer };
}
