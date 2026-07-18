/**
 * Embed capability port (ai.md). Turns text into vectors for the knowledge
 * base. Dimensions are fixed across implementations so stub-written and
 * gemini-written chunks live in the same pgvector column.
 */

export const EMBEDDING_DIMENSIONS = 768;

export interface Embedder {
  /** One vector per input text, EMBEDDING_DIMENSIONS wide. */
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDER = Symbol('EMBEDDER');
