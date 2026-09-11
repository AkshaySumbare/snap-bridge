# SnapBridge — Product Roadmap

**Personal Capture OS: Cross-device sync, screenshot intelligence, and document AI**

| Document | Version | Date |
|----------|---------|------|
| Product Roadmap | 1.0 | September 2026 |

---

## Product Vision

SnapBridge is a cross-platform personal capture layer. Whatever you copy, screenshot, or save flows across your devices, gets organized, and becomes searchable and actionable.

**One-line pitch:** Copy across devices + never lose a screenshot — find anything by text search.

**Platforms (planned):** React Native (iOS & Android), Web dashboard, Desktop (later)

**Tech stack (planned):** Node.js backend, real-time sync (WebSocket), object storage, vector DB (Phase 2), OCR + RAG (Phase 2)

---

## Phase 1 — MVP (Must-Have Features)

**Goal:** Ship a reliable, demo-ready product. Prove cross-device sync + screenshot value.

**Timeline:** Weeks 1–6

### Core Features (Top 5)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Cross-Device Clipboard Sync** | Copy text on phone → paste on laptop (and reverse). Real-time sync across paired devices. |
| 2 | **QR Device Pairing** | Link phone and laptop in one scan. Trusted device list with revoke option. |
| 3 | **Capture History** | All synced clips saved in one timeline. View, search, star, and delete from any device. |
| 4 | **Screenshot Vault** | Auto-import new screenshots (with user permission). Single organized library instead of scattered gallery clutter. |
| 5 | **OCR Search** | Extract text from screenshots via OCR. Full-text search — find “order id”, “UPI”, “amount” instantly. |

### Supporting Infrastructure (Phase 1)

| Area | What to build |
|------|----------------|
| **Auth** | Sign up, login, JWT sessions |
| **Security** | Encrypted transport (TLS); E2E encryption for clipboard content where feasible |
| **Sync engine** | WebSocket real-time push + offline queue when network returns |
| **Apps** | React Native — Android & iOS; Web dashboard (paste panel + library view) |
| **Backend** | User service, device registry, clip storage, screenshot metadata + blob storage |
| **Basics UX** | Pin / star important captures; pull-to-refresh; device online status |

### Phase 1 — Explicitly Out of Scope

- PDF chat / RAG
- AI summaries and semantic search
- Smart link capture (read-later)
- Reminders and smart actions
- File handoff (AirDrop-style files)
- Browser extension
- Desktop native app
- Team / family shared spaces
- Paid subscriptions (can stub plans only)

### Phase 1 Success Criteria

- [ ] Copy on Android phone → paste on web within 2 seconds (same network or mobile data)
- [ ] Two devices paired via QR in under 30 seconds
- [ ] Last 100 clips visible on all devices
- [ ] New screenshots appear in vault within 1 minute of capture
- [ ] OCR search returns correct screenshot for stored text

---

## Phase 2 — Growth Features (v1.0 → v1.2)

**Goal:** Differentiate with AI, organization, and monetization. Retain users beyond “clipboard toy”.

**Timeline:** Weeks 7–12 (v1.0), then Months 4–6 (v1.1–v1.2)

---

### Phase 2A — v1.0 (Weeks 7–12)

#### Screenshot Intelligence

| Feature | Description |
|---------|-------------|
| **Auto Folders** | Sort into Bills, OTP, Shopping, Work, Memes, Travel, Other |
| **App Source Tags** | Tag by originating app (Chrome, Instagram, WhatsApp, etc.) |
| **Duplicate Detection** | Flag similar/duplicate screenshots; suggest cleanup |

#### Document AI (RAG)

| Feature | Description |
|---------|-------------|
| **PDF Upload & Sync** | Upload PDF on any device; available everywhere |
| **PDF Chat** | Ask questions; answers with page citations |
| **Unified Search** | One search bar across clips, screenshots, and PDFs |

#### Platform & UX

| Feature | Description |
|---------|-------------|
| **Android Share Sheet** | “Send to SnapBridge” from any app |
| **iOS Share Extension** | Same on iOS |
| **Biometric App Lock** | Fingerprint / Face ID to open app |
| **Account Data Export** | Export all data; delete account (privacy compliance) |
| **Remote Device Revoke** | Remove lost device from trusted list |

#### AI Backend

| Feature | Description |
|---------|-------------|
| **Vector Embeddings** | Pinecone or Qdrant for semantic indexing |
| **Async Workers** | OCR, embedding, and indexing job queue |
| **Hybrid Search** | Keyword (OCR) + semantic vector rerank |
| **On-Device OCR** | ML Kit on mobile; cloud fallback |

#### Monetization

| Feature | Description |
|---------|-------------|
| **Freemium Limits** | Device count, storage cap, AI query limits |
| **Pro Subscription** | Razorpay / Stripe — unlimited devices, full AI |

---

### Phase 2B — v1.1 (Months 4–5)

#### Enhanced Sync

| Feature | Description |
|---------|-------------|
| **Rich Clip Types** | Links, code blocks, markdown preserved |
| **Browser Extension** | Chrome / Edge — save selection to vault |
| **Paste Notification** | Laptop notification: “Clip ready — Ctrl+V to paste” |
| **Small File Handoff** | Send images/PDFs ≤10MB phone ↔ laptop |
| **Multi-Device (Pro)** | Up to 5 paired devices |

#### Smart Capture

| Feature | Description |
|---------|-------------|
| **Smart Link Capture** | Auto-detect copied URLs → save + fetch preview |
| **Link AI Summary** | 2-line summary + tags (News, Job, Tutorial, etc.) |
| **Smart Actions** | Detect URL / phone / OTP in capture → one-tap action |
| **Capture Reminders** | “Remind me about this screenshot” push notification |
| **Bulk Screenshot Actions** | Delete, move folder, export ZIP |

#### Security & Storage

| Feature | Description |
|---------|-------------|
| **Private Vault** | Extra-protected folder for OTPs and sensitive shots |
| **Auto-Delete Policy** | User-set expiry for clips (7 / 30 / 90 days) |
| **LLM Cost Controls** | Per-user token budget and response caching |

#### Platform

| Feature | Description |
|---------|-------------|
| **Desktop App** | Electron or Tauri — system tray quick paste |
| **Home Screen Widget** | Last 5 captures at a glance |
| **Scanned PDF OCR** | Make image-only PDFs searchable |

---

### Phase 2C — v1.2 (Month 6)

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Natural language: “red dress Myntra order screenshot” |
| **Sensitive Region Blur** | Auto-blur OTP / card hints in vault |
| **Structured Extract** | Pull amount, date, order ID from bill screenshots |
| **Read-Later Queue** | Links folder with mark-as-read |
| **Referral Program** | Invite friend → bonus Pro days |
| **Windows / macOS Menu Bar** | Native quick-paste entry points |

---

## Phase 3 Preview (Future — Not Phase 2)

For reference only; do not build until Phase 2 is stable.

- Shared Family / Team clipboard spaces
- Snippet template library
- Voice notes → transcribe → search
- Expense pipeline (CSV export from bills)
- LangGraph agent: “What did I capture about tax this month?”
- Multi-PDF workspaces + highlight-to-ask
- Personal knowledge graph
- Zero-knowledge vault (Pro tier)
- B2B API / enterprise

---

## Architecture Snapshot

```
 [React Native iOS/Android]     [Web Dashboard]
              │                          │
              └────────────┬─────────────┘
                           │  WSS + HTTPS
                    ┌──────▼──────┐
                    │ API Gateway │
                    └──────┬──────┘
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
  │ Sync Service│   │Capture Svc  │   │ AI Service  │
  │ (real-time) │   │(files/meta) │   │(OCR/RAG)    │
  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         └────────┬────────┴────────┬────────┘
                  │                 │
           ┌──────▼──────┐   ┌──────▼──────┐
           │ Redis       │   │ Blob Store  │
           │ pub/sub     │   │ + Vector DB │
           └─────────────┘   └─────────────┘
```

---

## Monetization Model (Phase 2+)

| Tier | Price (indicative) | Includes |
|------|-------------------|----------|
| Free | ₹0 | 2 devices, 7-day clip history, 50 screenshots/mo |
| Pro | ₹149–299/mo | Unlimited devices, full history, AI search, PDF Q&A |
| Family | ₹399/mo | Up to 5 users (Phase 3) |

---

## Resume Positioning

> **SnapBridge** — Cross-platform capture sync (clipboard + screenshots + PDFs) with encrypted real-time sync and RAG-powered search, built with React Native, Node.js, WebSocket sync, vector search, and OCR pipelines.

---

## Document Control

| Field | Value |
|-------|-------|
| Product codename | SnapBridge / CaptureOS |
| Author | Private — keep secure |
| Classification | Internal / Personal |
| Next review | After Phase 1 MVP complete |

---

*End of document*
