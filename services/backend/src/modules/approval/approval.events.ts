/** Domain event emitted when a client responds to an approval request. */
export const APPROVAL_DECIDED = 'approval.decided';

export interface ApprovalDecidedEvent {
  meetingId: string;
  approvalId: string;
  decision: 'APPROVED' | 'CHANGES_REQUESTED';
  comment: string | null;
}
