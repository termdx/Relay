import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANSWERER, type Answerer } from './answerer';
import { AnthropicClient } from './anthropic-client';
import { DRAFT_GENERATOR, type DraftGenerator } from './draft-generator';
import { EMBEDDER, type Embedder } from './embedder';
import { GeminiAnswerer } from './gemini-answerer';
import { GeminiDraftGenerator } from './gemini-draft-generator';
import { GeminiEmbedder } from './gemini-embedder';
import {
  HfAnswerer,
  HfDraftGenerator,
  HfEmbedder,
  OpenAiEmbedder,
  type ChatJsonClient,
  type EmbedClient,
} from './hf-adapters';
import { HfClient } from './hf-client';
import { OpenAiCompatibleClient } from './openai-compatible-client';
import { OpenRouterClient } from './openrouter-client';
import { StubAnswerer } from './stub-answerer';
import { StubDraftGenerator } from './stub-draft-generator';
import { StubEmbedder } from './stub-embedder';

/**
 * AI module — owns the AI seam. Three capability ports (ai.md): draft, chat
 * (ANSWERER), embed. Each is chosen by AI_PROVIDER, with a stub keeping every
 * flow working offline. Supported providers:
 *
 *   stub        deterministic placeholders (default, no network)
 *   gemini      Google Gemini (native adapters)
 *   huggingface HF router (OpenAI-compatible chat + feature-extraction embed)
 *   openai      OpenAI (chat + embeddings)
 *   openrouter  OpenRouter (chat/draft only; embeddings fall back)
 *   anthropic   Anthropic Messages API (chat/draft only; embeddings fall back)
 *   ollama      local Ollama via its /v1 endpoint (chat + embeddings)
 *   litellm     any LiteLLM proxy (OpenAI-compatible chat + embeddings)
 *
 * A selected provider that isn't one of these fails loudly rather than
 * silently degrading to the stub — the stub is only for AI_PROVIDER=stub.
 */

function requireKey(config: ConfigService, key: string, provider: string): string {
  const value = config.get<string>(key);
  if (!value) throw new Error(`AI_PROVIDER=${provider} but ${key} is not set.`);
  return value;
}

function provider(config: ConfigService): string {
  return config.get<string>('AI_PROVIDER', 'stub').toLowerCase();
}

/** A prompt-in/JSON-out chat client + its model, for the shared adapters. */
function chatClientFor(
  config: ConfigService,
): { client: ChatJsonClient; model: string; label: string } | null {
  switch (provider(config)) {
    case 'huggingface':
      return {
        client: new HfClient(requireKey(config, 'HF_TOKEN', 'huggingface')),
        model: config.get<string>('HF_MODEL', 'meta-llama/Llama-3.3-70B-Instruct'),
        label: 'Hugging Face',
      };
    case 'openrouter':
      return {
        client: new OpenRouterClient(requireKey(config, 'OPENROUTER_API_KEY', 'openrouter')),
        model: config.get<string>('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'),
        label: 'OpenRouter',
      };
    case 'openai':
      return {
        client: new OpenAiCompatibleClient(
          'https://api.openai.com/v1',
          requireKey(config, 'OPENAI_API_KEY', 'openai'),
          'OpenAI',
        ),
        model: config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
        label: 'OpenAI',
      };
    case 'litellm':
      return {
        client: new OpenAiCompatibleClient(
          requireKey(config, 'LITELLM_BASE_URL', 'litellm'),
          config.get<string>('LITELLM_API_KEY', 'litellm'),
          'LiteLLM',
        ),
        model: requireKey(config, 'LITELLM_MODEL', 'litellm'),
        label: 'LiteLLM',
      };
    case 'ollama':
      return {
        client: new OpenAiCompatibleClient(
          `${config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')}/v1`,
          'ollama',
          'Ollama',
        ),
        model: config.get<string>('OLLAMA_MODEL', 'llama3.1'),
        label: 'Ollama',
      };
    case 'anthropic':
      return {
        client: new AnthropicClient(requireKey(config, 'ANTHROPIC_API_KEY', 'anthropic')),
        model: config.get<string>('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest'),
        label: 'Anthropic',
      };
    default:
      return null;
  }
}

/** An OpenAI-style embed client + model for providers that embed natively. */
function embedClientFor(
  config: ConfigService,
): { client: EmbedClient; model: string; label: string } | null {
  switch (provider(config)) {
    case 'openai':
      return {
        client: new OpenAiCompatibleClient(
          'https://api.openai.com/v1',
          requireKey(config, 'OPENAI_API_KEY', 'openai'),
          'OpenAI',
        ),
        model: config.get<string>('OPENAI_EMBED_MODEL', 'text-embedding-3-small'),
        label: 'OpenAI',
      };
    case 'litellm':
      return {
        client: new OpenAiCompatibleClient(
          requireKey(config, 'LITELLM_BASE_URL', 'litellm'),
          config.get<string>('LITELLM_API_KEY', 'litellm'),
          'LiteLLM',
        ),
        model: requireKey(config, 'LITELLM_EMBED_MODEL', 'litellm'),
        label: 'LiteLLM',
      };
    case 'ollama':
      return {
        client: new OpenAiCompatibleClient(
          `${config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')}/v1`,
          'ollama',
          'Ollama',
        ),
        model: config.get<string>('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),
        label: 'Ollama',
      };
    default:
      return null;
  }
}

/**
 * Providers that can't embed (openrouter, anthropic) borrow another installed
 * provider's embedder — the runtime keeps every provider's key in the env.
 */
function embedFallback(config: ConfigService, logger: Logger, active: string): Embedder {
  if (config.get<string>('GEMINI_API_KEY')) {
    const model = config.get<string>('GEMINI_EMBED_MODEL', 'gemini-embedding-001');
    logger.log(`Embedder: Gemini (${model}) — ${active} has no embeddings`);
    return new GeminiEmbedder(config.get<string>('GEMINI_API_KEY')!, model);
  }
  if (config.get<string>('HF_TOKEN')) {
    const model = config.get<string>('HF_EMBED_MODEL', 'sentence-transformers/all-mpnet-base-v2');
    logger.log(`Embedder: Hugging Face (${model}) — ${active} has no embeddings`);
    return new HfEmbedder(new HfClient(config.get<string>('HF_TOKEN')!), model);
  }
  logger.warn(`Embedder: stub — ${active} has no embeddings and no fallback key is set`);
  return new StubEmbedder();
}

/** Fail loud: a selected provider we don't implement must not silently stub. */
function unsupported(config: ConfigService): Error {
  return new Error(
    `AI_PROVIDER="${provider(config)}" is not supported. ` +
      `Use one of: stub, gemini, huggingface, openai, openrouter, anthropic, ollama, litellm.`,
  );
}

@Module({
  providers: [
    {
      provide: DRAFT_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DraftGenerator => {
        const logger = new Logger('AiModule');
        if (provider(config) === 'stub') {
          logger.log('DraftGenerator: stub (placeholder output)');
          return new StubDraftGenerator();
        }
        if (provider(config) === 'gemini') {
          const model = config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
          logger.log(`DraftGenerator: Gemini (${model})`);
          return new GeminiDraftGenerator(requireKey(config, 'GEMINI_API_KEY', 'gemini'), model);
        }
        const chat = chatClientFor(config);
        if (!chat) throw unsupported(config);
        logger.log(`DraftGenerator: ${chat.label} (${chat.model})`);
        return new HfDraftGenerator(chat.client, chat.model);
      },
    },
    {
      provide: EMBEDDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Embedder => {
        const logger = new Logger('AiModule');
        const active = provider(config);
        if (active === 'stub') {
          logger.log('Embedder: stub (hash-based vectors)');
          return new StubEmbedder();
        }
        if (active === 'gemini') {
          const model = config.get<string>('GEMINI_EMBED_MODEL', 'gemini-embedding-001');
          logger.log(`Embedder: Gemini (${model})`);
          return new GeminiEmbedder(requireKey(config, 'GEMINI_API_KEY', 'gemini'), model);
        }
        if (active === 'huggingface') {
          const model = config.get<string>(
            'HF_EMBED_MODEL',
            'sentence-transformers/all-mpnet-base-v2',
          );
          logger.log(`Embedder: Hugging Face (${model})`);
          return new HfEmbedder(new HfClient(requireKey(config, 'HF_TOKEN', 'huggingface')), model);
        }
        const embed = embedClientFor(config);
        if (embed) {
          logger.log(`Embedder: ${embed.label} (${embed.model})`);
          return new OpenAiEmbedder(embed.client, embed.model);
        }
        // openrouter / anthropic have no embeddings — borrow one.
        if (active === 'openrouter' || active === 'anthropic') {
          return embedFallback(config, logger, active);
        }
        throw unsupported(config);
      },
    },
    {
      provide: ANSWERER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Answerer => {
        const logger = new Logger('AiModule');
        if (provider(config) === 'stub') {
          logger.log('Answerer: stub (quotes context)');
          return new StubAnswerer();
        }
        if (provider(config) === 'gemini') {
          const model = config.get<string>('GEMINI_MODEL', 'gemini-flash-latest');
          logger.log(`Answerer: Gemini (${model})`);
          return new GeminiAnswerer(requireKey(config, 'GEMINI_API_KEY', 'gemini'), model);
        }
        const chat = chatClientFor(config);
        if (!chat) throw unsupported(config);
        logger.log(`Answerer: ${chat.label} (${chat.model})`);
        return new HfAnswerer(chat.client, chat.model);
      },
    },
  ],
  exports: [DRAFT_GENERATOR, EMBEDDER, ANSWERER],
})
export class AiModule {}
