import { backendRequest } from "./http";
import type {
  AuthResult,
  Client,
  ClientWithProjects,
  CreateClientInput,
  CreateMeetingInput,
  CreateProjectInput,
  Meeting,
  ProjectWithClient,
  PublicUser,
  TimelineEvent,
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
      },
    ) =>
      backendRequest<ProjectWithClient>(`/projects/${id}`, {
        method: "PATCH",
        body,
      }),
    timeline: (id: string) =>
      backendRequest<TimelineEvent[]>(`/projects/${id}/timeline`),
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
