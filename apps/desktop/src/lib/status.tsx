import type { BadgeProps } from "@/components/ui/badge";
import type { MeetingStatus } from "@/lib/api/types";

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

/** Can the founder still edit / send this meeting's draft? */
export function isEditable(status: MeetingStatus): boolean {
  return status === "DRAFTED" || status === "CHANGES_REQUESTED";
}
