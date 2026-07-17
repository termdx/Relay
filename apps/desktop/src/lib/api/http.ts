/** Base URLs. Hardcoded to localhost for the self-hosted single-machine case
 * (model (a)); becomes configurable when the desktop points at a remote VPS. */
export const BACKEND_URL = "http://localhost:3000";
export const RUNTIME_URL = "http://127.0.0.1:51720";

/** A backend error surfaced to the UI. `message` is safe to display. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let authToken: string | null = null;

/** Set by the auth store; attached as a bearer token to backend requests. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

/** Typed fetch against the backend API. Throws ApiError with a readable message. */
export async function backendRequest<T>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(", ");
    if (data.message) return data.message;
  } catch {
    // fall through to status text
  }
  return res.statusText || `Request failed (${res.status})`;
}
