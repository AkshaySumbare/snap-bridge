# SnapBridge — Product Roadmap (5 Phases)

| Document | Version | Date |
|----------|---------|------|
| Product Roadmap | 2.1 | September 2026 |

---

## Product Vision

SnapBridge is a **Personal Capture & Knowledge OS**. Users capture text, screenshots, and documents from any device — organize them automatically — search and ask questions across everything — and run smart flows (interview prep, study plans, contract compare, etc.).

**One-line pitch:** Capture anything → organize itself → ask anything → act on it.

**Platforms:** Web dashboard (now), React Native mobile (later), Desktop (later)

**Stack:** Node.js, MongoDB Atlas (metadata + vector search), Redis, BullMQ, Cloudinary, OpenAI embeddings

---

## Core Principles

1. **No third-party data integrations** — No email forwarding, no external calendar/mail APIs, no OAuth data pulls from Gmail/Notion/etc.
2. **User brings the data** — Copy/paste, upload files, share from device, screenshot capture. User controls what enters the system.
3. **Own the pipeline** — OCR, indexing, search, and AI run on our backend. No dependency on external AI wrappers for core features.
4. **Phase by phase** — Ship capture first, intelligence second, agents last.
5. **Privacy first** — User data stays in our storage; export and delete anytime.

---

## Phase 1 — Foundation & Capture Sync

**Goal:** Reliable cross-device capture. Prove the sync loop works.

**Timeline:** Weeks 1–6  
**Status:** Auth complete ✅

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Auth** | Sign up, login, Google OAuth, email verification, password reset, profile avatar |
| 2 | **Device Pairing** | QR code to link phone ↔ laptop. Trusted device list, revoke device |
| 3 | **Clipboard Sync** | Copy text on phone → paste on laptop (and reverse). Real-time via WebSocket |
| 4 | **Capture History** | Timeline of all synced clips. Search, star, pin, delete from any device |

### Infrastructure (Phase 1)

| Area | What to build |
|------|---------------|
| Sync engine | WebSocket real-time push + offline queue |
| Clip storage | MongoDB metadata + Redis pub/sub |
| Security | HTTP-only cookies, TLS, rate limiting |
| Web app | Dashboard shell, sidebar, protected routes |

### Phase 1 Success Criteria

- [ ] Two devices paired via QR in under 30 seconds
- [ ] Copy on phone → paste on web within 2 seconds
- [ ] Last 100 clips visible on all paired devices
- [ ] User can star, search, and delete clips

### Out of Scope (Phase 1)

- PDF upload, AI, smart folders, agents

---

## Phase 2 — Vault + Semantic Search (CURRENT)

**Goal:** Manual upload vault with background processing, vector embeddings, and natural-language Q&A across all documents.

**Timeline:** Weeks 7–12  
**Status:** Backend in progress 🔨

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Document Vault** | Manual upload: PDF, DOCX, images, screenshots via signed Cloudinary upload |
| 2 | **Text Extraction** | PDF parse, DOCX parse, OCR for images (async worker) |
| 3 | **Chunking + Embeddings** | Split text into chunks → OpenAI embeddings → MongoDB Atlas Vector Search |
| 4 | **Semantic Ask** | User asks random natural-language questions → vector search → optional AI answer with citations |
| 5 | **Smart Folders** | Auto-classify uploads: Bills, Work, Study, Career, Legal, Personal, Inbox |
| 6 | **Manual Folders** | User-created folders. Move documents between folders |
| 7 | **Screenshot Vault** | Same pipeline; `sourceType: screenshot` for image uploads |
| 8 | **Keyword Fallback** | MongoDB text index on `extractedText` when vector score is low |

### Infrastructure (Phase 2)

| Area | What to build |
|------|---------------|
| Blob storage | Cloudinary `snapbridge/vault/{userId}/` |
| Job queue | BullMQ + Redis (ioredis) — `document-process` queue |
| Vector search | **MongoDB Atlas Vector Search** on `document_chunks.embedding` (no Pinecone) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| RAG (light) | Retrieve top chunks → optional `gpt-4o-mini` answer |
| Models | `documents`, `document_chunks`, `folders` in MongoDB |

### Phase 2 Processing Flow

```
Upload → Cloudinary → confirm → BullMQ job
  → extract text → chunk → embed → save chunks
  → classify folder → status: ready

Ask → embed query → $vectorSearch → return chunks (+ optional LLM answer)
```

### Phase 2 Success Criteria

- [ ] Upload PDF → processed and searchable within 2 minutes
- [ ] "Find my AWS interview notes" returns relevant chunks via semantic search
- [ ] Ask endpoint returns source document links
- [ ] Smart folder assigns category on upload
- [ ] Atlas vector index configured and working

### Out of Scope (Phase 2)

- Device sync, clipboard (Phase 1 — deferred)
- Multi-step smart flows, mock interview
- Graph DB, Pinecone, email integrations

---

## Phase 3 — Projects & Advanced Intelligence

**Goal:** Organize vault into projects, scoped Q&A, and richer search UX.

**Timeline:** Weeks 13–18

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Projects** | Workspaces per topic — link related docs (MongoDB refs, no graph DB) |
| 2 | **Folder Q&A** | Ask scoped to folder or project |
| 3 | **PDF Chat UI** | Chat panel per document with page citations |
| 4 | **Entity Extraction** | Auto-detect people, dates, amounts, companies |
| 5 | **Duplicate Detection** | Flag similar documents |
| 6 | **Timeline View** | Browse uploads chronologically |
| 7 | **Saved Searches** | Save frequent queries |
| 8 | **Hybrid Search UI** | Universal search bar across vault + future clips |

### Phase 3 Success Criteria

- [ ] Project workspace groups related items
- [ ] Folder-scoped ask returns only relevant project docs
- [ ] PDF chat cites correct page numbers in UI

### Out of Scope (Phase 3)

- Multi-step agent flows, custom flows, knowledge graph UI

---

## Phase 4 — Smart Flows & Actions

**Goal:** User gives a goal → agent finds relevant docs → analyzes → generates plan/output.

**Timeline:** Weeks 17–24

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Smart Flows** | Hub for all agent-powered workflows |
| 2 | **Interview Prep** | Find resume + JD + notes → gap analysis → questions → 7-day plan |
| 3 | **Study Planner** | Upload notes/syllabus → generate daily study schedule + quiz cards |
| 4 | **Compare Documents** | Side-by-side analysis of two contracts, offers, or versions |
| 5 | **Finance Insights** | Analyze uploaded bills and bank statements → spending summary → budget plan |
| 6 | **Tasks** | Extract commitments and action items from meeting notes and documents |
| 7 | **Meeting Follow-up** | Upload meeting notes → auto-extract tasks, deadlines, decisions |
| 8 | **Job Match** | Upload resume + JD → match score, missing skills, cover letter draft |

### How Smart Flows Work

```
User trigger → Find relevant docs (search vault)
            → Extract structured data (dates, amounts, skills)
            → Analyze (compare, summarize, score)
            → Generate output (plan, checklist, questions)
            → Save to project + optional task list
```

**No external calls.** All source data comes from what the user already uploaded or copied into SnapBridge.

### Phase 4 Success Criteria

- [ ] "Interview Monday at Company X" produces resume match + prep plan in under 60 seconds
- [ ] Compare two contracts highlights key clause differences
- [ ] Tasks extracted from meeting notes with source links
- [ ] Study plan generated from uploaded college notes

### Out of Scope (Phase 4)

- Voice mock interview, knowledge graph visualization, custom user-defined flows

---

## Phase 5 — Advanced Intelligence & Platform

**Goal:** Power-user features, personalization, and platform maturity.

**Timeline:** Months 7–12

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Knowledge Graph** | Visual map of how documents, people, projects connect |
| 2 | **Mock Interview** | AI-generated interview practice based on resume + JD |
| 3 | **Insights Dashboard** | Spending trends, study progress, prep scores, capture stats |
| 4 | **Custom Flows** | User defines: "When I upload a JD, always run job match + interview prep" |
| 5 | **Progress Tracking** | Track smart flow completion: daily tasks, streaks, reminders |
| 6 | **Audio Transcription** | Upload audio → transcribe → searchable text (own pipeline) |
| 7 | **Video Notes** | Upload video → extract audio → transcribe → index |
| 8 | **Structured Extract** | Pull amount, date, order ID from bill screenshots automatically |
| 9 | **Sensitive Blur** | Auto-blur OTP/card hints in screenshots before storage |
| 10 | **Data Export** | Export all vault data as ZIP. Account deletion with full wipe |
| 11 | **Desktop App** | System tray quick paste + vault access (Electron/Tauri) |
| 12 | **Biometric Lock** | Fingerprint / Face ID on mobile app |

### Phase 5 Success Criteria

- [ ] Knowledge graph shows connections across 50+ documents
- [ ] Mock interview generates relevant questions from user's own resume
- [ ] Custom flow runs automatically on upload trigger
- [ ] Full data export works for compliance

---

## Feature Summary by Phase

| Phase | Theme | Key Features |
|-------|-------|--------------|
| **1** | Capture Sync | Auth, Device Pairing, Clipboard Sync, Capture History |
| **2** | Vault + Semantic Search | Document Vault, embeddings, Semantic Ask, Smart Folders, OCR |
| **3** | Projects & Intelligence | Projects, Folder Q&A, PDF Chat UI, Entity Extraction, Timeline |
| **4** | Smart Flows | Interview Prep, Study Planner, Compare Docs, Finance Insights, Tasks |
| **5** | Advanced | Knowledge Graph, Mock Interview, Insights, Custom Flows, Desktop App |

---

## Explicitly Out of Scope (All Phases)

| Item | Reason |
|------|--------|
| Email forwarding / inbox integration | No third-party data sources |
| Gmail / Outlook / Notion sync | User copies/uploads manually |
| External calendar integration | Tasks live inside SnapBridge only |
| Payment gateway (initially) | Stub plans only until Phase 4+ |
| Team / shared workspaces | Personal use first |
| Browser extension (external) | Phase 5 consideration only |
| Third-party AI API as core dependency | Own RAG pipeline; LLM is inference only |

---

## Architecture Snapshot

```
 [Web Dashboard]          [Mobile App — later]
        │                          │
        └────────────┬─────────────┘
                     │  WSS + HTTPS
              ┌──────▼──────┐
              │ API Gateway │
              └──────┬──────┘
       ┌─────────────┼─────────────┐
       │             │             │
┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
│ Sync Service│ │ Vault   │ │ AI Service  │
│ (clipboard) │ │ Service │ │ (OCR/RAG/   │
│             │ │ (files) │ │  Flows)     │
└──────┬──────┘ └────┬────┘ └──────┬──────┘
       │             │             │
       └──────┬──────┴──────┬──────┘
              │             │
       ┌──────▼──────┐ ┌────▼────┐
       │ MongoDB     │ │ Redis   │
       │ + Vector DB │ │ + Queue │
       └─────────────┘ └─────────┘
```

---

## Current Progress

| Phase | Status |
|-------|--------|
| Phase 1 — Auth | ✅ Complete |
| Phase 1 — Device Pairing | 🔲 Deferred |
| Phase 1 — Clipboard Sync | 🔲 Deferred |
| Phase 2 — Vault + Semantic Search | 🔨 Backend in progress |
| Phase 3–5 | 🔲 Planned |

---

## Document Control

| Field | Value |
|-------|-------|
| Product | SnapBridge / CaptureOS |
| Version | 2.0 |
| Classification | Internal |
| Next review | After Phase 1 MVP complete |

---

*End of document*
