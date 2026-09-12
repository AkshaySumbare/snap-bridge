import { Worker } from "bullmq";
import { config } from "../config.js";
import { DOCUMENT_QUEUE_NAME } from "../config/vault.js";
import type { DocumentProcessJobData } from "../queues/document.queue.js";
import { processDocument } from "../services/vault/document.service.js";

let worker: Worker<DocumentProcessJobData> | null = null;

export function startDocumentWorker(): Worker<DocumentProcessJobData> {
  if (worker) return worker;

  worker = new Worker<DocumentProcessJobData>(
    DOCUMENT_QUEUE_NAME,
    async (job) => {
      const { documentId } = job.data;
      console.log(`[vault-worker] Processing document ${documentId}`);
      await processDocument(documentId);
      console.log(`[vault-worker] Finished document ${documentId}`);
    },
    {
      connection: { url: config.redisUrl },
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[vault-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log("[vault-worker] Document processor started");
  return worker;
}

export async function stopDocumentWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
