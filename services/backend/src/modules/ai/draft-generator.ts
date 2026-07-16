/**
 * The AI seam for v0.1.
 *
 * Every AI-drafted output flows through this interface. Today the only
 * implementation is a deterministic stub (no model, no network). When the
 * privacy lane is decided, a real generator (Ollama or a hosted provider)
 * implements the same interface and is bound to this token — no calling code
 * changes. This is the honest v0.1 form of `ai.md`'s AI Gateway: one stable
 * contract, one implementation, swappable later.
 */

export interface DraftTask {
  title: string;
  body: string;
  assignee?: string;
}

export interface DraftResult {
  summary: string;
  tasks: DraftTask[];
}

export interface DraftGenerator {
  generateDraft(transcript: string): Promise<DraftResult>;
}

export const DRAFT_GENERATOR = Symbol('DRAFT_GENERATOR');
