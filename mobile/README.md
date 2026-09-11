# SnapBridge Mobile (React Native)

Phase 1 mobile app — Android & iOS.

## Planned features

- QR device pairing
- Clipboard listener + auto-sync
- Screenshot vault (photo library permission)
- OCR search (ML Kit on-device, cloud fallback)
- Capture history with star/delete

## Setup (next step)

```bash
npx @react-native-community/cli init SnapBridgeMobile --directory .
```

Or use Expo if preferred for faster Phase 1 iteration:

```bash
npx create-expo-app@latest . --template blank-typescript
```

## API endpoints used

- `POST /api/auth/login`
- `POST /api/devices/pair`
- `POST /api/clips`
- `GET /api/clips`
- `POST /api/screenshots`
- WebSocket: `clip:sync`, `clip:incoming`

See [../docs/snapbridge-product-roadmap.md](../docs/snapbridge-product-roadmap.md) for full scope.
