import { Module } from '@nestjs/common';
import { DRAFT_GENERATOR } from './draft-generator';
import { StubDraftGenerator } from './stub-draft-generator';

/**
 * AI module — owns the AI seam. Binds the `DRAFT_GENERATOR` token to a concrete
 * implementation. Swap the implementation here (Ollama / hosted provider)
 * without touching any consumer.
 */
@Module({
  providers: [{ provide: DRAFT_GENERATOR, useClass: StubDraftGenerator }],
  exports: [DRAFT_GENERATOR],
})
export class AiModule {}
