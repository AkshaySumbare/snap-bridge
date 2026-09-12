# SnapBridge Auth API

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

- `MONGODB_URI` — MongoDB Atlas connection string
- `REDIS_URL` — Redis URL (default `redis://localhost:6379`)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random strings
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud OAuth Web client
- `GOOGLE_REDIRECT_URI` — `http://localhost:4000/api/auth/google/callback`
- `GOOGLE_OAUTH_SUCCESS_REDIRECT` — frontend callback page, e.g. `http://localhost:5173/auth/callback`

Start Redis locally: `docker compose up -d redis`

### Google Cloud Console setup

1. Create OAuth 2.0 **Web application** credentials
2. Add authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
3. Copy Client ID + Client Secret into `.env`

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Manual signup |
| POST | `/api/auth/signup` | No | Alias for register |
| POST | `/api/auth/login` | No | Manual login |
| GET | `/api/auth/google` | No | Redirect to Google OAuth |
| GET | `/api/auth/google/callback` | No | Google callback (handled by server) |
| POST | `/api/auth/oauth/exchange` | No | Exchange one-time code for tokens |
| POST | `/api/auth/google/token` | No | Mobile/client idToken login |
| POST | `/api/auth/refresh` | No | Rotate tokens |
| POST | `/api/auth/logout` | No | Revoke refresh token |
| POST | `/api/auth/logout-all` | Bearer | Revoke all sessions |
| POST | `/api/auth/forgot-password` | No | Request reset token |
| POST | `/api/auth/reset-password` | No | Reset with token |
| GET | `/api/auth/me` | Bearer | Current user profile |

## Google OAuth redirect flow (web)

```
Browser                    Backend                         Google
   |                          |                               |
   |-- GET /api/auth/google ->|                               |
   |                          |-- redirect to Google -------->|
   |<------------------------- consent screen -----------------|
   |                          |<-- callback with code --------|
   |                          |  (validate state, get user)   |
   |<- redirect to frontend --|  (one-time exchange code)     |
   |                          |                               |
   |-- POST /oauth/exchange ->|                               |
   |<- access + refresh -----|                               |
```

1. User clicks "Sign in with Google" → navigate to `GET /api/auth/google`
2. Google redirects to `/api/auth/google/callback`
3. Backend redirects to `GOOGLE_OAUTH_SUCCESS_REDIRECT?code=<exchangeCode>`
4. Frontend calls `POST /api/auth/oauth/exchange` with `{ "code": "..." }`
5. Store `accessToken` + `refreshToken` from response

Exchange codes expire in **60 seconds** and are single-use.

### Frontend example

```ts
// Login button
window.location.href = "http://localhost:4000/api/auth/google";

// On /auth/callback page
const code = new URLSearchParams(window.location.search).get("code");
const error = new URLSearchParams(window.location.search).get("error");

if (error) {
  // show error
} else if (code) {
  const res = await fetch("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
}
```

## Token flow

1. Login/register returns `accessToken` (15m) + `refreshToken` (7d, stored in Redis).
2. Send `Authorization: Bearer <accessToken>` on protected routes.
3. When access token expires, call `/api/auth/refresh` with `refreshToken`.
4. Refresh rotates the refresh token (old one is invalidated).

## Rate limits

- Auth routes: 10 requests / 15 min per IP (Redis-backed)
- All other API routes: 100 requests / 15 min per IP

## Forgot password (dev)

Email sending is not integrated yet. In `NODE_ENV=development`, `/forgot-password` returns `resetToken` in the response for testing.
