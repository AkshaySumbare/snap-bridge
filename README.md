# SnapBridge

Cross-platform personal capture layer — clipboard sync, screenshot vault, and OCR search.

**Phase 1 MVP:** Cross-device clipboard sync, QR pairing, capture history, screenshot vault, OCR search.

## Repo structure

```
snapbridge/
├── backend/     Node.js API + WebSocket sync
├── web/         React dashboard (paste panel + library)
├── mobile/      React Native app (Phase 1 — coming next)
└── docs/        Product roadmap
```

## Quick start

### Prerequisites

- Node.js 20+
- Docker (optional, for Postgres + Redis)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure backend

```bash
cp backend/.env.example backend/.env
```

### 3. Start infrastructure (optional)

```bash
docker compose up -d
```

### 4. Run dev servers

```bash
npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:5173

## Phase 1 checklist

- [ ] Auth (signup / login / JWT)
- [ ] QR device pairing
- [ ] Cross-device clipboard sync (< 2s)
- [ ] Capture history (last 100 clips)
- [ ] Screenshot vault
- [ ] OCR full-text search

See [docs/snapbridge-product-roadmap.md](docs/snapbridge-product-roadmap.md) for full Phase 1 & 2 scope.
