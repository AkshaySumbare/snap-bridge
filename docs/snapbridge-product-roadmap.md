# SnapBridge — Product Roadmap (5 Phases)

| Document | Version | Date |
|----------|---------|------|
| Product Roadmap | 2.0 | September 2026 |

---

## Product Vision

SnapBridge is a **Personal Capture & Knowledge OS**. Users capture text, screenshots, and documents from any device — organize them automatically — search and ask questions across everything — and run smart flows (interview prep, study plans, contract compare, etc.).

**One-line pitch:** Capture anything → organize itself → ask anything → act on it.

**Platforms:** Web dashboard (now), React Native mobile (later), Desktop (later)

**Stack:** Node.js, MongoDB, Redis, Cloudinary (files), Vector DB (Phase 3+), OCR + RAG (Phase 3+)

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

## Phase 2 — Vault & Document Storage

**Goal:** Expand beyond text clips. Store screenshots and documents. Make everything searchable by text.

**Timeline:** Weeks 7–10

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Screenshot Vault** | Import screenshots from device (permission-based). Organized library, not scattered gallery |
| 2 | **Document Vault** | Manual upload: PDF, DOCX, images, audio, video. Available on all paired devices |
| 3 | **OCR Search** | Extract text from screenshots and image-only PDFs. Full-text keyword search |
| 4 | **Smart Folders** | Auto-sort uploads into categories: Bills, Work, Study, Career, Legal, Personal, Other |
| 5 | **Manual Folders** | User-created folders and subfolders. Move, rename, delete |
| 6 | **Tags** | Manual tags on any item. Filter vault by tag |
| 7 | **Bulk Actions** | Select multiple items → move folder, delete, export ZIP |

### Infrastructure (Phase 2)

| Area | What to build |
|------|---------------|
| Blob storage | Cloudinary for images/PDFs (already integrated for avatars) |
| OCR worker | Async job queue — process uploads in background |
| Metadata model | Documents, folders, tags, capture types in MongoDB |
| Mobile share | Share sheet → send file/screenshot to SnapBridge (no external API) |

### Phase 2 Success Criteria

- [ ] Upload PDF on web → visible on mobile within 1 minute
- [ ] Screenshot OCR search returns correct item for stored text
- [ ] Auto folder assigns correct category for 80%+ of test uploads
- [ ] User can create custom folders and move items

### Out of Scope (Phase 2)

- Semantic/AI search, PDF chat, smart flows

---

## Phase 3 — Universal Search & Intelligence

**Goal:** One search bar across all content. AI-powered Q&A with source citations.

**Timeline:** Weeks 11–16

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Universal Search** | Single search bar across clips, screenshots, and documents. Keyword + semantic hybrid |
| 2 | **Projects** | Workspaces per topic (e.g. "AWS Project", "Interview Prep"). Link related docs together |
| 3 | **PDF Chat** | Ask questions about a PDF. Answers with page citations |
| 4 | **Folder Q&A** | Ask questions scoped to a folder or project: "Summarize everything in this project" |
| 5 | **Entity Extraction** | Auto-detect people, dates, amounts, companies from uploaded content |
| 6 | **Duplicate Detection** | Flag similar screenshots and documents. Suggest merge or delete |
| 7 | **Timeline View** | Browse all captures and uploads chronologically |
| 8 | **Saved Searches** | Save frequent queries: "pending tasks", "unpaid bills", "interview notes" |

### Infrastructure (Phase 3)

| Area | What to build |
|------|---------------|
| Vector DB | Qdrant or Pinecone for embeddings |
| Chunking pipeline | Split PDFs/docs into chunks, embed, index |
| RAG service | Retrieve relevant chunks → LLM answer with citations |
| Hybrid search | Keyword (OCR/text) + vector rerank |

### Phase 3 Success Criteria

- [ ] "Summarize my AWS project" returns accurate answer with doc links
- [ ] PDF chat cites correct page numbers
- [ ] Universal search finds items across clips, screenshots, and PDFs
- [ ] Project workspace groups related items correctly

### Out of Scope (Phase 3)

- Multi-step agent flows, task scheduling, mock interviews

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
| **2** | Vault & Storage | Screenshot Vault, Document Vault, OCR Search, Smart Folders, Tags |
| **3** | Search & AI | Universal Search, Projects, PDF Chat, Folder Q&A, Entity Extraction |
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
| Phase 1 — Device Pairing | 🔲 Not started |
| Phase 1 — Clipboard Sync | 🔲 Not started |
| Phase 1 — Capture History | 🔲 Not started |
| Phase 2–5 | 🔲 Planned |

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
