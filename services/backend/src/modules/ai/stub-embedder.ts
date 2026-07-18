import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, type Embedder } from './embedder';

/**
 * Deterministic offline embeddings: token-hash bag-of-words projected into
 * EMBEDDING_DIMENSIONS and L2-normalized. Not semantically smart, but shared
 * tokens produce nearby vectors — enough for retrieval tests without a
 * network call, and stable across runs.
 */
@Injectable()
export class StubEmbedder implements Embedder {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const token of tokens) {
      const digest = createHash('sha256').update(token).digest();
      const index = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
      const sign = digest[4]! % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }
}
