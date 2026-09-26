export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly detail?: unknown;

  constructor(shape: { code?: string; message: string; status?: number; detail?: unknown }) {
    super(shape.message);
    this.name = "ApiError";
    this.code = (shape.code as ApiErrorCode) ?? "UNKNOWN";
    this.status = shape.status;
    this.detail = shape.detail;
  }
}
