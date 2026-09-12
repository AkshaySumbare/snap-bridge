import { useAuthStore } from "@/stores/auth.store";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.error === "string") return data.error;

    const flattened = data.error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };

    if (flattened?.formErrors?.length) return flattened.formErrors[0];

    const fieldErrors = flattened?.fieldErrors;
    if (fieldErrors) {
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors[firstField]?.[0]) {
        return fieldErrors[firstField][0];
      }
    }

    return res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      useAuthStore.getState().clearUser();
      return false;
    }

    return true;
  } catch {
    useAuthStore.getState().clearUser();
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry && path !== "/auth/refresh") {
    if (!refreshPromise) {
      refreshPromise = refreshSession().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
