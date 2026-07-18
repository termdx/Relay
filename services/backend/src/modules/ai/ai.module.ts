import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRAFT_GENERATOR, type DraftGenerator } from './draft-generator';
import { GeminiDraftGenerator } from './gemini-draft-generator';
import { StubDraftGenerator } from './stub-draft-generator';

/**
 * AI module — owns the AI seam. The concrete DraftGenerator is chosen by the
 * AI_PROVIDER config value (the honest v0.1 form of `ai.md`'s gateway: one
 * stable contract, config-selected implementation, no consumer changes).
 *
 *   AI_PROVIDER=stub    -> deterministic placeholder (default, no network)
 *   AI_PROVIDER=gemini  -> Google Gemini (requires GEMINI_API_KEY)
 */
@Module({
  providers: [
    {
      provide: DRAFT_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DraftGenerator => {
        const logger = new Logger('AiModule');
        const provider = config
          .get<string>('AI_PROVIDER', 'stub')
          .toLowerCase();

        if (provider === 'gemini') {
          const apiKey = config.get<string>('GEMINI_API_KEY');
          if (!apiKey) {
            throw new Error(
              'AI_PROVIDER=gemini but GEMINI_API_KEY is not set.',
            );
          }
          const model = config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
          logger.log(`DraftGenerator: Gemini (${model})`);
          return new GeminiDraftGenerator(apiKey, model);
        }

        logger.log('DraftGenerator: stub (placeholder output)');
        return new StubDraftGenerator();
      },
    },
  ],
  exports: [DRAFT_GENERATOR],
})
export class AiModule {}
