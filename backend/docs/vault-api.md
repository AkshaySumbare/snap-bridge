# Vault API — Phase 2 (Semantic Search)

Document vault with background processing, vector embeddings, and natural-language Q&A.

**Base path:** `/api/vault`  
**Auth:** HTTP-only cookie (`sb_access_token`) or `Authorization: Bearer <token>`

---

## Backend folder structure

```
backend/src/
├── config/
│   └── vault.ts              # Allowed MIME types, queue name, vector index name
├── models/vault/
│   ├── Document.ts           # Vault document metadata
│   ├── DocumentChunk.ts      # Text chunks + embeddings
│   └── Folder.ts             # System + custom folders
├── services/vault/
│   ├── upload.service.ts     # Signed Cloudinary upload
│   ├── document.service.ts   # CRUD + processing pipeline
│   ├── folder.service.ts     # Folder management
│   ├── text-extraction.service.ts  # PDF, DOCX, OCR
│   ├── chunking.service.ts   # Split text into chunks
│   ├── embedding.service.ts  # OpenAI embeddings
│   ├── classification.service.ts   # Smart folder rules
│   └── semantic-search.service.ts  # Vector search + optional answer
├── queues/
│   └── document.queue.ts     # BullMQ queue
├── workers/
│   └── document.worker.ts    # Background document processor
├── routes/
│   └── vault.ts              # API routes
└── validators/
    └── vault.validator.ts    # Zod schemas
```

---

## Processing flow

```
1. POST /upload/sign        → signed Cloudinary params
2. Client uploads file      → Cloudinary direct upload
3. POST /upload/confirm     → create document (status: processing)
4. BullMQ worker:
     download → extract text → chunk → embed → save chunks
     → classify folder → status: ready
5. POST /ask                → embed query → $vectorSearch → optional LLM answer
```

---

## MongoDB Atlas vector index (required)

Create this index in **Atlas UI → Search → Create Search Index → JSON Editor**:

**Collection:** `documentchunks`  
**Index name:** `chunk_embedding_index` (must match `VECTOR_SEARCH_INDEX_NAME`)

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    },
    {
      "type": "filter",
      "path": "folderId"
    },
    {
      "type": "filter",
      "path": "documentId"
    }
  ]
}
```

> Requires **MongoDB Atlas M10+** cluster for vector search.

---

## Endpoints

### Upload

#### `POST /api/vault/upload/sign`

Request:
```json
{
  "mimeType": "application/pdf",
  "fileName": "resume.pdf"
}
```

Response: Cloudinary signed upload params + `mimeType`, `resourceType`, `maxBytes`.

#### `POST /api/vault/upload/confirm`

Request:
```json
{
  "publicId": "snapbridge/vault/userId/resume-abc123.pdf",
  "secureUrl": "https://res.cloudinary.com/...",
  "mimeType": "application/pdf",
  "format": "pdf",
  "bytes": 102400,
  "resourceType": "raw",
  "title": "My Resume",
  "folderId": "optional-folder-id"
}
```

Response `201`:
```json
{
  "document": { "id": "...", "status": "processing", ... },
  "message": "Upload confirmed. Document is being processed."
}
```

**Allowed MIME types:** `application/pdf`, DOCX, JPEG, PNG, WEBP, GIF

---

### Documents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault/documents` | List documents (`?folderId=&status=&limit=&offset=`) |
| GET | `/api/vault/documents/:id` | Get single document |
| PATCH | `/api/vault/documents/:id/move` | Move to folder `{ "folderId": "..." }` |
| DELETE | `/api/vault/documents/:id` | Delete document + chunks + Cloudinary file |
| POST | `/api/vault/documents/:id/retry` | Re-process a failed/stuck document (e.g. after OpenAI quota restored) |
| POST | `/api/vault/documents/retry-failed` | Retry all failed documents for the user |

### Retry processing

Use when embedding fails (OpenAI credit limit, network error, etc.).

#### `POST /api/vault/documents/:id/retry`

No body required.

Response:
```json
{
  "document": { "id": "...", "status": "processing", ... },
  "message": "Document re-queued for processing. Check status until it becomes ready."
}
```

Then poll `GET /api/vault/documents/:id` until `status` is `ready`.

#### `POST /api/vault/documents/retry-failed`

Retries every document with `status: "failed"` for the logged-in user.

Response:
```json
{
  "retried": ["docId1", "docId2"],
  "errors": [],
  "total": 2,
  "message": "Retried 2 of 2 failed document(s)."
}
```

**Note:** BullMQ also auto-retries up to **3 times** with exponential backoff before marking `failed`.

---

### Semantic Ask

#### `POST /api/vault/ask`

Request:
```json
{
  "query": "Find everything related to my AWS interview preparation",
  "folderId": "optional",
  "documentId": "optional",
  "limit": 8,
  "generateAnswer": true
}
```

Response:
```json
{
  "query": "...",
  "results": [
    {
      "documentId": "...",
      "documentTitle": "Interview Notes",
      "chunkText": "...",
      "chunkIndex": 0,
      "pageNumber": null,
      "score": 0.89,
      "secureUrl": "https://...",
      "sourceType": "pdf"
    }
  ],
  "answer": "Based on your documents [1]..."
}
```

---

### Folders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault/folders` | List folders (auto-seeds system folders) |
| POST | `/api/vault/folders` | Create custom folder `{ "name": "My Project" }` |
| DELETE | `/api/vault/folders/:id` | Delete custom folder (system folders protected) |

**System folders:** Inbox, Bills, Work, Study, Career, Legal, Personal

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| bullmq | ^5.34 | Job queue |
| ioredis | ^5.4 | BullMQ Redis connection |
| openai | ^4.77 | Embeddings + chat answers |
| pdf-parse | ^1.1 | PDF text extraction |
| mammoth | ^1.8 | DOCX text extraction |
| tesseract.js | ^5.1 | Image OCR |
| mime-types | ^2.1 | MIME detection |

---

## Error codes

| Status | Meaning |
|--------|---------|
| 400 | Invalid file type, validation error |
| 401 | Not authenticated |
| 404 | Document or folder not found |
| 503 | OpenAI not configured or vector index missing |
