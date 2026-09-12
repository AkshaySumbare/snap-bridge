# SnapBridge

Cross-platform personal capture layer — clipboard sync, screenshot vault, and OCR search.

## Repo structure

```
snapbridge/
├── backend/     Node.js auth API (MongoDB + Redis)
├── web/         React dashboard (coming next)
├── mobile/      React Native app (later)
└── docs/        Product roadmap
```

## Quick start

### Prerequisites

- Node.js 20+
- MongoDB Atlas account
- Redis (local or Redis Cloud)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure backend

```bash
cp backend/.env.example backend/.env
# Fill in MONGODB_URI, REDIS_URL, JWT secrets
```

### 3. Run backend

```bash
npm run dev:backend
```

API: http://localhost:4000

## Auth API

See [backend/docs/auth-api.md](backend/docs/auth-api.md) for all endpoints.

## Progress

- [x] Auth (signup / login / cookies / Google OAuth / email verification)
- [x] Profile avatars (Cloudinary signed upload)
- [x] **Phase 2 backend — Vault + Semantic Search** (see [backend/docs/vault-api.md](backend/docs/vault-api.md))
- [ ] Vault frontend UI
- [ ] Device pairing, clipboard sync (deferred)

See [docs/snapbridge-product-roadmap.md](docs/snapbridge-product-roadmap.md) and [docs/snapbridge-product-roadmap.docx](docs/snapbridge-product-roadmap.docx) for full scope.
