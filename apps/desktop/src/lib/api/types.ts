/** Types mirroring the backend + runtime API contracts. Kept local so the
 * browser bundle never imports node-side packages. */

export type UserRole = "owner" | "member";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

export type MeetingStatus =
  | "DRAFTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "CHANGES_REQUESTED";

export interface MeetingTask {
  id: string;
  title: string;
  body: string;
  assignee: string | null;
  githubIssueUrl: string | null;
  position: number;
}

export interface Meeting {
  id: string;
  title: string;
  transcript: string;
  clientEmail: string;
  githubRepo: string;
  status: MeetingStatus;
  summary: string | null;
  clientComment: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: MeetingTask[];
}

export interface CreateMeetingInput {
  title: string;
  transcript: string;
  clientEmail: string;
  githubRepo: string;
}

export interface UpdateDraftInput {
  summary: string;
  tasks: { title: string; body?: string; assignee?: string }[];
}

/** Runtime (admin) surface. */
export interface AiProviderSummary {
  id: string;
  provider: string;
  defaultModel?: string;
  hasApiKey: boolean;
  models: string[];
}

export interface ModuleSummary {
  id: string;
  version: string;
  displayName?: string;
  dependencies: string[];
}

export interface IntegrationSummary {
  id: string;
  version: string;
  displayName?: string;
}

export interface RuntimeHealth {
  environment: {
    dockerCli: { ok: boolean; detail?: string };
    dockerDaemon: { ok: boolean; detail?: string };
    compose: { ok: boolean; detail?: string };
  };
  services: { service: string; state: string; health?: string }[];
  diagnostics: { level: "error" | "warning"; code: string; message: string }[];
  overall: "ok" | "degraded" | "error";
}
