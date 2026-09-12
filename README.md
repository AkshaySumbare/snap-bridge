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

## Phase 1 progress

- [x] Auth (signup / login / JWT / refresh tokens)
- [x] Google OAuth redirect flow
- [x] Forgot / reset password
- [x] Redis rate limiting
- [ ] Device pairing, clips, screenshots (next)

See [docs/snapbridge-product-roadmap.md](docs/snapbridge-product-roadmap.md) for full scope.
