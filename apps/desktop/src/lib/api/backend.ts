import { backendRequest } from "./http";
import type {
  AskResult,
  AuthResult,
  Client,
  ClientWithProjects,
  CreateClientInput,
  CreateMeetingInput,
  CreateProjectInput,
  Decision,
  Meeting,
  ProjectWithClient,
  PublicUser,
  TimelineEvent,
  Todo,
  TodoStatus,
  UpdateDraftInput,
} from "./types";

/** Typed backend API — the product surface (meetings, approvals, auth). */
export const backend = {
  auth: {
    status: () =>
      backendRequest<{ needsSetup: boolean }>("/auth/status", { auth: false }),
    register: (body: { email: string; name: string; password: string }) =>
      backendRequest<AuthResult>("/auth/register", {
        method: "POST",
        body,
        auth: false,
      }),
    login: (body: { email: string; password: string }) =>
      backendRequest<AuthResult>("/auth/login", {
        method: "POST",
        body,
        auth: false,
      }),
    me: () => backendRequest<PublicUser>("/auth/me"),
    updateMe: (body: { name?: string; avatar?: string }) =>
      backendRequest<PublicUser>("/auth/me", { method: "PATCH", body }),
  },
  clients: {
    list: () => backendRequest<ClientWithProjects[]>("/clients"),
    get: (id: string) => backendRequest<ClientWithProjects>(`/clients/${id}`),
    create: (body: CreateClientInput) =>
      backendRequest<Client>("/clients", { method: "POST", body }),
    update: (id: string, body: Partial<CreateClientInput>) =>
      backendRequest<ClientWithProjects>(`/clients/${id}`, {
        method: "PATCH",
        body,
      }),
  },
  projects: {
    list: () => backendRequest<ProjectWithClient[]>("/projects"),
    get: (id: string) => backendRequest<ProjectWithClient>(`/projects/${id}`),
    create: (body: CreateProjectInput) =>
      backendRequest<ProjectWithClient>("/projects", { method: "POST", body }),
    update: (
      id: string,
      body: Partial<Omit<CreateProjectInput, "clientId">> & {
        status?: ProjectWithClient["status"];
        portalSettings?: Partial<import("./types").PortalSettings>;
      },
    ) =>
      backendRequest<ProjectWithClient>(`/projects/${id}`, {
        method: "PATCH",
        body,
      }),
    timeline: (id: string) =>
      backendRequest<TimelineEvent[]>(`/projects/${id}/timeline`),
    ask: (id: string, question: string) =>
      backendRequest<AskResult>(`/projects/${id}/ask`, {
        method: "POST",
        body: { question },
      }),
  },
  agentRuns: {
    create: (body: {
      agentId: string;
      agentName: string;
      model: string;
      tools?: string[];
      projectId: string;
      instruction: string;
    }) =>
      backendRequest<import("./types").AgentRun>("/agent-runs", {
        method: "POST",
        body,
      }),
    get: (id: string) =>
      backendRequest<import("./types").AgentRun>(`/agent-runs/${id}`),
  },
  branding: {
    get: () => backendRequest<import("./types").Branding>("/branding"),
    update: (body: Partial<import("./types").Branding>) =>
      backendRequest<import("./types").Branding>("/branding", {
        method: "PUT",
        body,
      }),
  },
  knowledge: {
    reindex: () =>
      backendRequest<{ scanned: number; added: number }>(
        "/knowledge/reindex",
        { method: "POST" },
      ),
  },
  todos: {
    list: (projectId: string) =>
      backendRequest<Todo[]>(`/projects/${projectId}/todos`),
    create: (projectId: string, body: { title: string; body?: string; assignee?: string }) =>
      backendRequest<Todo>(`/projects/${projectId}/todos`, {
        method: "POST",
        body,
      }),
    setStatus: (id: string, status: TodoStatus) =>
      backendRequest<Todo>(`/todos/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
  },
  decisions: {
    list: (projectId: string) =>
      backendRequest<Decision[]>(`/projects/${projectId}/decisions`),
    create: (projectId: string, body: { title: string; detail?: string }) =>
      backendRequest<Decision>(`/projects/${projectId}/decisions`, {
        method: "POST",
        body,
      }),
  },
  meetings: {
    list: () => backendRequest<Meeting[]>("/meetings"),
    get: (id: string) => backendRequest<Meeting>(`/meetings/${id}`),
    create: (body: CreateMeetingInput) =>
      backendRequest<Meeting>("/meetings", { method: "POST", body }),
    updateDraft: (id: string, body: UpdateDraftInput) =>
      backendRequest<Meeting>(`/meetings/${id}/draft`, {
        method: "PATCH",
        body,
      }),
    sendForApproval: (id: string) =>
      backendRequest<{ meeting: Meeting; approvalUrl: string }>(
        `/meetings/${id}/send-for-approval`,
        { method: "POST" },
      ),
  },
};
