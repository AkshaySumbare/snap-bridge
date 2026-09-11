import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  createClip,
  createPairingCode,
  fetchClips,
  fetchDevices,
  login,
  signup,
  type Clip,
  type Device,
  type User,
} from "./api";

const TOKEN_KEY = "snapbridge_token";
const USER_KEY = "snapbridge_user";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [newClip, setNewClip] = useState("");
  const [incomingClip, setIncomingClip] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [search, setSearch] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);

  const persistSession = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    socket?.disconnect();
    setSocket(null);
    setToken(null);
    setUser(null);
    setClips([]);
    setDevices([]);
  }, [socket]);

  useEffect(() => {
    if (!token) return;

    fetchClips(token).then(setClips).catch((err) => setError(String(err)));
    fetchDevices(token).then(setDevices).catch((err) => setError(String(err)));

    const nextSocket = io("/", {
      auth: { token },
      transports: ["websocket"],
    });

    nextSocket.on("clip:new", (clip: Clip) => {
      setClips((prev) => [clip, ...prev].slice(0, 100));
    });

    nextSocket.on("clip:incoming", (payload: { content: string }) => {
      setIncomingClip(payload.content);
    });

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [token]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result =
        authMode === "login"
          ? await login(email, password)
          : await signup(email, password);
      persistSession(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  async function handleCreateClip(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newClip.trim()) return;
    setError("");
    try {
      const clip = await createClip(token, newClip.trim());
      setClips((prev) => [clip, ...prev].slice(0, 100));
      setNewClip("");
      socket?.emit("clip:sync", { content: clip.content, contentType: "text" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save clip");
    }
  }

  async function handlePairDevice() {
    if (!token) return;
    setError("");
    try {
      const result = await createPairingCode(token, "Web Dashboard");
      setPairingCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pairing code");
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      const results = await fetchClips(token, search.trim() || undefined);
      setClips(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  if (!token || !user) {
    return (
      <div className="app">
        <header>
          <h1>SnapBridge</h1>
        </header>
        <div className="card" style={{ maxWidth: 420 }}>
          <h2>{authMode === "login" ? "Sign in" : "Create account"}</h2>
          <p className="muted">Phase 1 MVP — cross-device clipboard sync</p>
          <form onSubmit={handleAuth} className="grid">
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit">{authMode === "login" ? "Sign in" : "Sign up"}</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
            >
              {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>SnapBridge</h1>
          <p className="muted">
            <span className="status-dot" />
            {user.email}
          </p>
        </div>
        <button className="secondary" onClick={logout}>Sign out</button>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="grid two-col">
        <div className="card">
          <h2>New clip</h2>
          <form onSubmit={handleCreateClip} className="grid">
            <textarea
              value={newClip}
              onChange={(e) => setNewClip(e.target.value)}
              placeholder="Copy something here to sync across devices..."
            />
            <button type="submit" disabled={!newClip.trim()}>Save & sync</button>
          </form>
          {incomingClip && (
            <div style={{ marginTop: "1rem" }}>
              <strong>Incoming clip</strong>
              <p className="clip-content">{incomingClip}</p>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Pair device</h2>
          <p className="muted">Scan or enter this code on your phone to link devices.</p>
          {pairingCode ? (
            <div className="pairing-code">{pairingCode}</div>
          ) : (
            <button onClick={handlePairDevice}>Generate pairing code</button>
          )}
          <h3 style={{ marginTop: "1.5rem" }}>Trusted devices</h3>
          <ul className="clip-list">
            {devices.map((device) => (
              <li key={device.id}>
                <strong>{device.name}</strong>
                <div className="muted">{device.platform}</div>
              </li>
            ))}
            {devices.length === 0 && <li className="muted">No devices paired yet</li>}
          </ul>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <h2>Capture history</h2>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", flex: 1, maxWidth: 360 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clips..."
            />
            <button type="submit" className="secondary">Search</button>
          </form>
        </div>
        <ul className="clip-list">
          {clips.map((clip) => (
            <li key={clip.id}>
              <div className="clip-content">{clip.content}</div>
              <div className="muted">{new Date(clip.created_at).toLocaleString()}</div>
            </li>
          ))}
          {clips.length === 0 && <li className="muted">No clips yet — save your first one above</li>}
        </ul>
      </div>
    </div>
  );
}
