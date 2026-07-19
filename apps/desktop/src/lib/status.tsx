import type { BadgeProps } from "@/components/ui/badge";
import type { MeetingStatus, ProjectStatus } from "@/lib/api/types";

interface StatusMeta {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
}

const MEETING_STATUS: Record<MeetingStatus, StatusMeta> = {
  DRAFTED: { label: "Draft", variant: "outline" },
  PENDING_APPROVAL: { label: "Awaiting client", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", variant: "destructive" },
};

export function meetingStatusMeta(status: MeetingStatus): StatusMeta {
  return MEETING_STATUS[status];
}

const PROJECT_STATUS: Record<ProjectStatus, StatusMeta> = {
  ACTIVE: { label: "Active", variant: "success" },
  PAUSED: { label: "Paused", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "outline" },
};

export function projectStatusMeta(status: ProjectStatus): StatusMeta {
  return PROJECT_STATUS[status];
}

/** Can the founder still edit / send this meeting's draft? */
export function isEditable(status: MeetingStatus): boolean {
  return status === "DRAFTED" || status === "CHANGES_REQUESTED";
}
