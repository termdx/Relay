import { Injectable } from '@nestjs/common';
import type { Answerer, ContextChunk, GroundedAnswer } from './answerer';

/** Offline grounded answers: quotes the top context entries verbatim. */
@Injectable()
export class StubAnswerer implements Answerer {
  async answer(
    question: string,
    context: ContextChunk[],
  ): Promise<GroundedAnswer> {
    if (context.length === 0) {
      return {
        answer: `The project history doesn't cover that yet. (stub answer for: "${question}")`,
        citedRefs: [],
      };
    }
    const top = context.slice(0, 3);
    return {
      answer: `From the project history: ${top
        .map((chunk) => `${chunk.text} [${chunk.ref}]`)
        .join(' · ')}`,
      citedRefs: top.map((chunk) => chunk.ref),
    };
  }
}
