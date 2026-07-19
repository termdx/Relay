/**
 * Server endpoints. Local single-machine by default; Settings → Agency
 * server points the desktop at an agency-hosted runtime/backend instead.
 */
export interface ServerConfig {
  backendUrl: string;
  runtimeUrl: string;
  /** Sent as X-Relay-Token to a remote runtime daemon (RELAY_RUNTIME_TOKEN). */
  runtimeToken: string;
}

const SERVER_KEY = "relay.server";

export const LOCAL_SERVER: ServerConfig = {
  backendUrl: "http://localhost:3000",
  runtimeUrl: "http://127.0.0.1:51720",
  runtimeToken: "",
};

export function getServerConfig(): ServerConfig {
  try {
    const stored = localStorage.getItem(SERVER_KEY);
    if (!stored) return LOCAL_SERVER;
    return { ...LOCAL_SERVER, ...(JSON.parse(stored) as Partial<ServerConfig>) };
  } catch {
    return LOCAL_SERVER;
  }
}

export function setServerConfig(config: ServerConfig): void {
  localStorage.setItem(SERVER_KEY, JSON.stringify(config));
}

export function backendUrl(): string {
  return getServerConfig().backendUrl.replace(/\/$/, "");
}

export function runtimeUrl(): string {
  return getServerConfig().runtimeUrl.replace(/\/$/, "");
}


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

  const res = await fetch(`${backendUrl()}${path}`, {
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

/**
 * Like backendRequest but against an explicit server. Invite joins must talk
 * to the invite's server, which is usually not the configured backend yet.
 */
export async function externalRequest<T>(
  baseUrl: string,
  path: string,
  { method = "GET", body }: Omit<RequestOptions, "auth"> = {},
): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
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
