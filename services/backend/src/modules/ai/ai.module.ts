import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANSWERER, type Answerer } from './answerer';
import { DRAFT_GENERATOR, type DraftGenerator } from './draft-generator';
import { EMBEDDER, type Embedder } from './embedder';
import { GeminiAnswerer } from './gemini-answerer';
import { GeminiDraftGenerator } from './gemini-draft-generator';
import { GeminiEmbedder } from './gemini-embedder';
import { HfAnswerer, HfDraftGenerator, HfEmbedder } from './hf-adapters';
import { HfClient } from './hf-client';
import { OpenRouterClient } from './openrouter-client';
import { StubAnswerer } from './stub-answerer';
import { StubDraftGenerator } from './stub-draft-generator';
import { StubEmbedder } from './stub-embedder';

/**
 * AI module — owns the AI seam. Three capability ports (ai.md): draft, chat
 * (ANSWERER), embed. Each is chosen by AI_PROVIDER, with a stub keeping every
 * flow working offline:
 *
 *   AI_PROVIDER=stub    -> deterministic placeholders (default, no network)
 *   AI_PROVIDER=gemini  -> Google Gemini (requires GEMINI_API_KEY)
 */

function geminiKey(config: ConfigService): string {
  const apiKey = config.get<string>('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('AI_PROVIDER=gemini but GEMINI_API_KEY is not set.');
  }
  return apiKey;
}

function hf(config: ConfigService): { client: HfClient; model: string; embedModel: string } {
  const token = config.get<string>('HF_TOKEN');
  if (!token) {
    throw new Error('AI_PROVIDER=huggingface but HF_TOKEN is not set.');
  }
  return {
    client: new HfClient(token),
    model: config.get<string>('HF_MODEL', 'meta-llama/Llama-3.3-70B-Instruct'),
    embedModel: config.get<string>(
      'HF_EMBED_MODEL',
      'sentence-transformers/all-mpnet-base-v2',
    ),
  };
}

function openrouter(config: ConfigService): { client: OpenRouterClient; model: string } {
  const apiKey = config.get<string>('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('AI_PROVIDER=openrouter but OPENROUTER_API_KEY is not set.');
  }
  return {
    client: new OpenRouterClient(apiKey),
    model: config.get<string>(
      'OPENROUTER_MODEL',
      'meta-llama/llama-3.3-70b-instruct:free',
    ),
  };
}

function provider(config: ConfigService): string {
  return config.get<string>('AI_PROVIDER', 'stub').toLowerCase();
}

@Module({
  providers: [
    {
      provide: DRAFT_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DraftGenerator => {
        const logger = new Logger('AiModule');
        if (provider(config) === 'gemini') {
          const model = config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
          logger.log(`DraftGenerator: Gemini (${model})`);
          return new GeminiDraftGenerator(geminiKey(config), model);
        }
        if (provider(config) === 'huggingface') {
          const { client, model } = hf(config);
          logger.log(`DraftGenerator: Hugging Face (${model})`);
          return new HfDraftGenerator(client, model);
        }
        if (provider(config) === 'openrouter') {
          const { client, model } = openrouter(config);
          logger.log(`DraftGenerator: OpenRouter (${model})`);
          return new HfDraftGenerator(client, model);
        }
        logger.log('DraftGenerator: stub (placeholder output)');
        return new StubDraftGenerator();
      },
    },
    {
      provide: EMBEDDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Embedder => {
        const logger = new Logger('AiModule');
        if (provider(config) === 'gemini') {
          const model = config.get<string>(
            'GEMINI_EMBED_MODEL',
            'gemini-embedding-001',
          );
          logger.log(`Embedder: Gemini (${model})`);
          return new GeminiEmbedder(geminiKey(config), model);
        }
        if (provider(config) === 'huggingface') {
          const { client, embedModel } = hf(config);
          logger.log(`Embedder: Hugging Face (${embedModel})`);
          return new HfEmbedder(client, embedModel);
        }
        // OpenRouter has no embeddings endpoint. The runtime keeps every
        // installed provider's keys in the env, so fall through to Gemini
        // (then HF) for real vectors before giving up on the stub.
        if (provider(config) === 'openrouter') {
          if (config.get<string>('GEMINI_API_KEY')) {
            const model = config.get<string>('GEMINI_EMBED_MODEL', 'gemini-embedding-001');
            logger.log(`Embedder: Gemini (${model}) — OpenRouter has no embeddings`);
            return new GeminiEmbedder(geminiKey(config), model);
          }
          if (config.get<string>('HF_TOKEN')) {
            const { client, embedModel } = hf(config);
            logger.log(`Embedder: Hugging Face (${embedModel}) — OpenRouter has no embeddings`);
            return new HfEmbedder(client, embedModel);
          }
        }
        logger.log('Embedder: stub (hash-based vectors)');
        return new StubEmbedder();
      },
    },
    {
      provide: ANSWERER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Answerer => {
        const logger = new Logger('AiModule');
        if (provider(config) === 'gemini') {
          const model = config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
          logger.log(`Answerer: Gemini (${model})`);
          return new GeminiAnswerer(geminiKey(config), model);
        }
        if (provider(config) === 'huggingface') {
          const { client, model } = hf(config);
          logger.log(`Answerer: Hugging Face (${model})`);
          return new HfAnswerer(client, model);
        }
        if (provider(config) === 'openrouter') {
          const { client, model } = openrouter(config);
          logger.log(`Answerer: OpenRouter (${model})`);
          return new HfAnswerer(client, model);
        }
        logger.log('Answerer: stub (quotes context)');
        return new StubAnswerer();
      },
    },
  ],
  exports: [DRAFT_GENERATOR, EMBEDDER, ANSWERER],
})
export class AiModule {}
