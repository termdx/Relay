import { Injectable, Logger } from '@nestjs/common';
import {
  DraftGenerator,
  DraftResult,
  DraftTask,
} from './draft-generator';

/**
 * Deterministic placeholder generator. It performs a naive extraction so the
 * review screen has real, editable content to exercise the workflow — but it
 * is NOT intelligence. It exists only to prove the loop (upload -> review ->
 * approve -> push) end to end before a real model is wired in.
 */
@Injectable()
export class StubDraftGenerator implements DraftGenerator {
  private readonly logger = new Logger(StubDraftGenerator.name);

  private static readonly ACTION_PATTERN =
    /\b(todo|action|will|need to|should|next step|let's|follow[- ]?up)\b/i;

  generateDraft(transcript: string): Promise<DraftResult> {
    this.logger.warn(
      'Using StubDraftGenerator — output is placeholder text, not model output.',
    );

    const lines = transcript
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const summary =
      lines.slice(0, 3).join(' ').slice(0, 500) ||
      'Discussion summary pending — edit before sending to the client.';

    const tasks: DraftTask[] = lines
      .filter((line) => StubDraftGenerator.ACTION_PATTERN.test(line))
      .slice(0, 5)
      .map((line) => ({
        title: line.slice(0, 80),
        body: line,
      }));

    return Promise.resolve({ summary, tasks });
  }
}
