/**
 * GitHub integration seam. Per `integrations.md`, integrations live behind
 * dedicated adapter modules. v0.1 ships a stub; the real adapter (Octokit)
 * implements the same interface later without changing callers.
 */

export interface IssueInput {
  title: string;
  body: string;
  assignee?: string | null;
}

export interface PublishedIssue {
  title: string;
  url: string;
}

export interface GithubIssuePublisher {
  /** @param repo "owner/repo" */
  publishIssues(repo: string, issues: IssueInput[]): Promise<PublishedIssue[]>;
}

export const GITHUB_ISSUE_PUBLISHER = Symbol('GITHUB_ISSUE_PUBLISHER');
