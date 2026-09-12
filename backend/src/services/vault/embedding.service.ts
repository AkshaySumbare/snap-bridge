import OpenAI from "openai";
import { config } from "../../config.js";
import { AppError } from "../../utils/errors.js";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new AppError(503, "OpenAI is not configured. Add OPENAI_API_KEY to backend/.env");
  }
  openaiClient ??= new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(config.openaiApiKey);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getOpenAI();
  const batchSize = 64;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: config.embeddingModel,
      input: batch,
      dimensions: config.embeddingDimensions,
    });

    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedTexts([query]);
  return embedding;
}
