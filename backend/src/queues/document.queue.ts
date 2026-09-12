import { Queue } from "bullmq";
import { config } from "../config.js";
import { DOCUMENT_QUEUE_NAME } from "../config/vault.js";

export interface DocumentProcessJobData {
  documentId: string;
}

let documentQueue: Queue<DocumentProcessJobData> | null = null;

function getRedisConnection() {
  return { url: config.redisUrl };
}

export function getDocumentQueue(): Queue<DocumentProcessJobData> {
  documentQueue ??= new Queue<DocumentProcessJobData>(DOCUMENT_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return documentQueue;
}

function jobIdForDocument(documentId: string): string {
  return `doc-${documentId}`;
}

export async function isDocumentJobActive(documentId: string): Promise<boolean> {
  const queue = getDocumentQueue();
  const existing = await queue.getJob(jobIdForDocument(documentId));
  if (!existing) return false;
  const state = await existing.getState();
  return state === "active" || state === "waiting" || state === "delayed";
}

export async function enqueueDocumentProcessing(
  documentId: string,
  options?: { replaceExisting?: boolean },
) {
  const queue = getDocumentQueue();
  const jobId = jobIdForDocument(documentId);

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    const isActive = state === "active" || state === "waiting" || state === "delayed";
    if (isActive) {
      throw new Error("Document is already queued or processing");
    }
    if (options?.replaceExisting) {
      await existing.remove();
    }
  }

  await queue.add("process", { documentId }, { jobId });
}

export async function closeDocumentQueue(): Promise<void> {
  if (documentQueue) {
    await documentQueue.close();
    documentQueue = null;
  }
}
