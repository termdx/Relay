/**
 * Chat capability port (ai.md): grounded Q&A. The answer must come from the
 * supplied context only — retrieval scoping happens in SQL before the model
 * ever sees anything, never via prompt.
 */

export interface ContextChunk {
  /** Citation index the answer refers to, 1-based. */
  ref: number;
  text: string;
}

export interface GroundedAnswer {
  answer: string;
  /** Which context refs the answer actually used. */
  citedRefs: number[];
}

export interface Answerer {
  answer(question: string, context: ContextChunk[]): Promise<GroundedAnswer>;
}

export const ANSWERER = Symbol('ANSWERER');
