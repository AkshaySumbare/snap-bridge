import { apiFetch, ApiError as ClientApiError } from "@/lib/api-client";
import { ApiError } from "./errors";

export interface ApiClientOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, searchParams?: ApiClientOptions["searchParams"]): string {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as { success: boolean; data?: unknown; error?: { code?: string; message?: string } };
    if (!envelope.success) {
      throw new ApiError({
        code: envelope.error?.code ?? "UNKNOWN",
        message: envelope.error?.message ?? "Request failed",
      });
    }
    return envelope.data;
  }
  return payload;
}

async function request<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const url = buildUrl(path, options.searchParams);
  try {
    if (options.body instanceof FormData) {
      const res = await fetch(url.startsWith("/api") ? url : `/api${url}`, {
        method: options.method ?? "POST",
        body: options.body,
        credentials: "include",
        signal: options.signal,
      });
      const json = await res.json();
      return unwrap(json) as T;
    }

    const json = await apiFetch<unknown>(url, {
      method: options.method,
      signal: options.signal,
      body:
        options.body === undefined || options.body instanceof FormData
          ? undefined
          : JSON.stringify(options.body),
    });
    return unwrap(json) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof ClientApiError) {
      throw new ApiError({ code: "UNKNOWN", message: err.message, status: err.status });
    }
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Network request failed",
    });
  }
}

export async function apiFetchEnvelope<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  return request<T>(path, options);
}

export const api = {
  get: <T>(path: string, opts?: ApiClientOptions) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: ApiClientOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: ApiClientOptions) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: ApiClientOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: ApiClientOptions) => request<T>(path, { ...opts, method: "DELETE" }),
};

export { apiFetchEnvelope as apiFetch };
