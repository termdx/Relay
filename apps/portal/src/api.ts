/** Portal API client. Every data call carries the portal session token. */

export const BACKEND_URL: string =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:3000";

const TOKEN_KEY = "relay-portal-token";

export const session = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export class PortalApiError extends Error {}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const token = session.get();
    if (!token) throw new PortalApiError("Not signed in.");
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && auth) {
    session.clear();
    window.location.assign("/");
    throw new PortalApiError("Session expired.");
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { message?: string | string[] })
    | null;
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data?.message.join(", ")
      : data?.message;
    throw new PortalApiError(message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface PortalClientInfo {
  id: string;
  name: string;
  company: string | null;
  email: string;
}

export interface PortalVisibility {
  showAnalytics: boolean;
  showFeed: boolean;
  feedShowsCode: boolean;
  showTodos: boolean;
  showDecisions: boolean;
  showAsk: boolean;
}

export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  githubRepo: string | null;
  /** What the agency chose to show — the API enforces the same flags. */
  portal: PortalVisibility;
}

export interface PortalOverview {
  todos: { open: number; done: number };
  last30Days: {
    commits: number;
    prsMerged: number;
    issuesClosed: number;
    meetingsApproved: number;
    decisions: number;
  };
  weeklyActivity: { weekStart: string; events: number }[];
  lastActivityAt: string | null;
}

export interface FeedEvent {
  id: string;
  type: string;
  actor:
    | { kind: "user"; id: string }
    | { kind: "client"; email: string }
    | { kind: "integration"; id: string }
    | { kind: "ai"; id: string }
    | { kind: "system" };
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface PortalTodo {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  externalUrl: string | null;
  completedAt: string | null;
}

export interface PortalDecision {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface PortalApproval {
  id: string;
  meetingTitle: string;
  status: string;
  respondedAt: string | null;
  createdAt: string;
  approvePath: string;
}

export interface AskSource {
  ref: number;
  cited: boolean;
  snippet: string;
  type: string;
  occurredAt: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

export interface PortalBranding {
  agencyName: string | null;
  logo: string | null;
  accentColor: string | null;
}

export const portal = {
  branding: () =>
    request<PortalBranding>("/portal/branding", { auth: false }),
  requestLink: (email: string) =>
    request<{ status: string }>("/portal/auth/request-link", {
      method: "POST",
      body: { email },
      auth: false,
    }),
  redeem: (token: string) =>
    request<{ accessToken: string; client: PortalClientInfo }>(
      "/portal/auth/redeem",
      { method: "POST", body: { token }, auth: false },
    ),
  me: () =>
    request<{ client: PortalClientInfo; projects: PortalProject[] }>(
      "/portal/me",
    ),
  overview: (projectId: string) =>
    request<PortalOverview>(`/portal/projects/${projectId}/overview`),
  feed: (projectId: string) =>
    request<FeedEvent[]>(`/portal/projects/${projectId}/feed`),
  todos: (projectId: string) =>
    request<PortalTodo[]>(`/portal/projects/${projectId}/todos`),
  decisions: (projectId: string) =>
    request<PortalDecision[]>(`/portal/projects/${projectId}/decisions`),
  approvals: () => request<PortalApproval[]>("/portal/approvals"),
  ask: (projectId: string, question: string) =>
    request<AskResult>(`/portal/projects/${projectId}/ask`, {
      method: "POST",
      body: { question },
    }),
};
