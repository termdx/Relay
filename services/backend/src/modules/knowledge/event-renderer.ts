/**
 * Renders a domain event into the plain-English line that gets embedded.
 * One place owns the vocabulary of the knowledge base; returns null for
 * events with nothing worth remembering.
 */

interface RenderableEvent {
  type: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export function renderEvent(event: RenderableEvent): string | null {
  const p = event.payload;
  const date = event.occurredAt.toISOString().slice(0, 10);
  const line = (text: string | null): string | null =>
    text ? `[${date}] ${text}` : null;

  switch (event.type) {
    case 'project.created':
      return line(`Project started: ${str(p.name) ?? 'unnamed'}.`);
    case 'meeting.drafted':
      return line(`Meeting held: "${str(p.title) ?? 'untitled'}".`);
    case 'meeting.sent_for_approval':
      return line(`Meeting summary for "${str(p.title)}" sent to the client for approval.`);
    case 'meeting.approved': {
      const summary = str(p.summary);
      const comment = str(p.comment);
      return line(
        `Client approved the meeting "${str(p.title)}".` +
          (comment ? ` Client comment: "${comment}".` : '') +
          (summary ? ` Approved summary: ${summary}` : ''),
      );
    }
    case 'meeting.changes_requested': {
      const comment = str(p.comment);
      return line(
        `Client requested changes on "${str(p.title)}"${comment ? `: "${comment}"` : '.'}`,
      );
    }
    case 'todo.created':
      return line(`Todo added: "${str(p.title)}".`);
    case 'todo.completed':
      return line(
        `Todo completed: "${str(p.title)}"${p.via === 'github' ? ' (issue closed on GitHub)' : ''}.`,
      );
    case 'todo.reopened':
      return line(`Todo reopened: "${str(p.title)}".`);
    case 'decision.recorded': {
      const detail = str(p.detail);
      return line(
        `Decision recorded: "${str(p.title)}".${detail ? ` Reasoning: ${detail}` : ''}`,
      );
    }
    case 'notification.sent':
      return line(`Client emailed: "${str(p.subject)}".`);
    case 'agent.run_completed':
      return line(
        `Agent "${str(p.agentName)}" completed a run (${num(p.toolCalls) ?? 0} tool calls): ${str(p.instruction)}`,
      );
    case 'github.push':
    case 'gitlab.push':
    case 'bitbucket.push':
      return line(
        `${str(p.author) ?? 'Someone'} pushed ${num(p.commitCount) ?? 'some'} commit(s) to ${str(p.branch) ?? 'a branch'}: "${str(p.headMessage) ?? ''}".`,
      );
    case 'github.pr_opened':
    case 'gitlab.mr_opened':
    case 'bitbucket.pr_opened':
      return line(`${str(p.author) ?? 'Someone'} opened PR #${num(p.number)}: "${str(p.title)}".`);
    case 'github.pr_merged':
    case 'gitlab.mr_merged':
    case 'bitbucket.pr_merged':
      return line(`PR #${num(p.number)} merged: "${str(p.title)}".`);
    case 'github.pr_closed':
    case 'gitlab.mr_closed':
    case 'bitbucket.pr_declined':
      return line(`PR #${num(p.number)} closed without merging: "${str(p.title)}".`);
    case 'github.issue_opened':
    case 'gitlab.issue_opened':
      return line(`Issue #${num(p.number)} opened: "${str(p.title)}".`);
    case 'github.issue_closed':
    case 'gitlab.issue_closed':
      return line(`Issue #${num(p.number)} closed: "${str(p.title)}".`);
    default:
      return null;
  }
}
