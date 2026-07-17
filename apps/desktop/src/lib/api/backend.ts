import { backendRequest } from "./http";
import type {
  AuthResult,
  CreateMeetingInput,
  Meeting,
  PublicUser,
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
