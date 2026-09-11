const API_BASE = "/api";

export interface User {
  id: string;
  email: string;
}

export interface Clip {
  id: string;
  content: string;
  content_type: string;
  starred: number;
  device_id: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
  last_seen_at: string | null;
  created_at: string;
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function signup(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Signup failed");
  return data as { token: string; user: User };
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as { token: string; user: User };
}

export async function fetchClips(token: string, q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`${API_BASE}/clips${params}`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load clips");
  return data.clips as Clip[];
}

export async function createClip(token: string, content: string) {
  const res = await fetch(`${API_BASE}/clips`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create clip");
  return data.clip as Clip;
}

export async function createPairingCode(token: string, deviceName: string) {
  const res = await fetch(`${API_BASE}/devices/pairing-code`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ deviceName, platform: "web" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create pairing code");
  return data as { code: string; expiresAt: string; qrPayload: string };
}

export async function fetchDevices(token: string) {
  const res = await fetch(`${API_BASE}/devices`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load devices");
  return data.devices as Device[];
}
