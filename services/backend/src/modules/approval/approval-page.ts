import { Approval } from './entities/approval.entity';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The client's entire experience: no account, no install — a single page
 * reached by magic link. This is the surface the v0.1 experiment tests
 * (will a real client approve through this faster than replying to an email?).
 */
export function renderApprovalPage(approval: Approval): string {
  const { payload, status } = approval;
  const decided = status !== 'PENDING';

  const tasks = payload.tasks
    .map(
      (task) => `
        <li>
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.body ? `<div class="task-body">${escapeHtml(task.body)}</div>` : ''}
          ${task.assignee ? `<div class="task-assignee">Owner: ${escapeHtml(task.assignee)}</div>` : ''}
        </li>`,
    )
    .join('');

  const decidedBanner = decided
    ? `<div class="banner ${status === 'APPROVED' ? 'ok' : 'changes'}">
         You already responded: <strong>${status === 'APPROVED' ? 'Approved' : 'Changes requested'}</strong>.
         ${approval.clientComment ? `<div class="comment">“${escapeHtml(approval.clientComment)}”</div>` : ''}
       </div>`
    : '';

  const form = decided
    ? ''
    : `
      <form method="POST" class="actions">
        <textarea name="comment" placeholder="Optional comment for the team..."></textarea>
        <div class="buttons">
          <button type="submit" name="decision" value="APPROVED" class="approve">Approve</button>
          <button type="submit" name="decision" value="CHANGES_REQUESTED" class="changes">Request changes</button>
        </div>
      </form>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(payload.title)} — Approval</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.6 -apple-system, system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 2rem 1.25rem; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    .summary { white-space: pre-wrap; padding: 1rem; background: rgba(127,127,127,0.08); border-radius: 8px; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.75rem 0; border-bottom: 1px solid rgba(127,127,127,0.2); }
    .task-title { font-weight: 600; }
    .task-body { opacity: 0.8; font-size: 0.95rem; }
    .task-assignee { font-size: 0.85rem; opacity: 0.7; margin-top: 0.2rem; }
    textarea { width: 100%; min-height: 80px; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(127,127,127,0.4); box-sizing: border-box; font: inherit; }
    .buttons { display: flex; gap: 0.75rem; margin-top: 0.75rem; }
    button { flex: 1; padding: 0.75rem; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
    .approve { background: #16a34a; color: white; }
    .changes { background: rgba(127,127,127,0.15); }
    .banner { padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .banner.ok { background: rgba(22,163,74,0.15); }
    .banner.changes { background: rgba(234,179,8,0.15); }
    .comment { margin-top: 0.5rem; font-style: italic; }
    .muted { opacity: 0.6; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title)}</h1>
  <p class="muted">Please review the summary and proposed next steps below.</p>
  ${decidedBanner}
  <h2>Summary</h2>
  <div class="summary">${escapeHtml(payload.summary)}</div>
  <h2>Proposed next steps</h2>
  <ul>${tasks || '<li class="muted">No tasks proposed.</li>'}</ul>
  ${form}
</body>
</html>`;
}
