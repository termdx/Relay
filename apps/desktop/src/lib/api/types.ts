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

export interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  githubRepo: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClientWithProjects = Client & { projects: Project[] };
export type ProjectWithClient = Project & { client: Client };

export interface CreateClientInput {
  name: string;
  company?: string;
  email: string;
  notes?: string;
}

export interface CreateProjectInput {
  clientId: string;
  name: string;
  description?: string;
  githubRepo?: string;
}

export type TimelineActor =
  | { kind: "user"; id: string }
  | { kind: "client"; email: string }
  | { kind: "integration"; id: string }
  | { kind: "ai"; id: string }
  | { kind: "system" };

export interface TimelineEvent {
  id: string;
  projectId: string;
  clientId: string | null;
  type: string;
  actor: TimelineActor;
  payload: Record<string, unknown>;
  source: string;
  occurredAt: string;
  recordedAt: string;
}

export type TodoStatus = "OPEN" | "DONE";

export interface Todo {
  id: string;
  projectId: string;
  title: string;
  body: string;
  status: TodoStatus;
  assignee: string | null;
  source: "manual" | "meeting";
  externalUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  decidedBy: string;
  source: "manual" | "meeting" | "approval";
  createdAt: string;
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
  projectId: string | null;
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
  projectId?: string;
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
