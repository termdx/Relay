import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import type { AiProviderManifest } from '../schemas/ai-provider';
import type { ModuleManifest } from '../schemas/module';
import type { RelayConfig } from '../schemas/relay';

export interface ComposeService {
  image?: string;
  command?: string;
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  depends_on?: string[];
  networks?: string[];
  restart?: string;
  healthcheck?: {
    test: string[] | string;
    interval?: string;
    timeout?: string;
    retries?: number;
  };
}

export interface ComposeFile {
  name: string;
  services: Record<string, ComposeService>;
  volumes?: Record<string, Record<string, never>>;
  networks?: Record<string, Record<string, never>>;
}

export const POSTGRES_SERVICE = 'postgres';
const PGDATA_VOLUME = 'relay_pgdata';

/** Postgres is generated whenever any installed module needs storage. */
export function moduleNeedsPostgres(modules: ModuleManifest[]): boolean {
  return modules.some((m) => m.capabilities.storage);
}

/**
 * Map an installed AI provider to the backend environment it implies. This is
 * what retires the hand-edited services/backend/.env: the AI env is generated
 * from ai/<id>.yaml + secrets.
 */
export function aiProviderEnv(
  provider: AiProviderManifest | undefined,
  apiKey: string | undefined,
): Record<string, string> {
  if (!provider) return { AI_PROVIDER: 'stub' };
  switch (provider.provider) {
    case 'gemini':
      return {
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: apiKey ?? '',
        // The "-latest" alias tracks Google's current flash model — a pinned
        // name here rotted once already (2.5-flash got gated for new keys).
        GEMINI_MODEL: provider.defaultModel ?? 'gemini-flash-latest',
      };
    case 'huggingface':
      return {
        AI_PROVIDER: 'huggingface',
        HF_TOKEN: apiKey ?? '',
        HF_MODEL: provider.defaultModel ?? 'meta-llama/Llama-3.3-70B-Instruct',
        // Must be 768-dim to match the knowledge base's pgvector column.
        HF_EMBED_MODEL: 'sentence-transformers/all-mpnet-base-v2',
      };
    case 'openrouter':
      return {
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: apiKey ?? '',
        // A capable free-tier default; any openrouter.ai model id works.
        OPENROUTER_MODEL:
          provider.defaultModel ?? 'meta-llama/llama-3.3-70b-instruct:free',
      };
    case 'ollama':
      return {
        AI_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: provider.endpoint ?? 'http://localhost:11434',
        OLLAMA_MODEL: provider.defaultModel ?? '',
      };
    default:
      return { AI_PROVIDER: provider.provider };
  }
}

/** Pick the active provider: highest routing priority, then first installed. */
export function defaultProvider(
  providers: AiProviderManifest[],
): AiProviderManifest | undefined {
  return [...providers].sort(
    (a, b) => b.routing.priority - a.routing.priority,
  )[0];
}

/**
 * Build the compose object deterministically from config + installed modules.
 * `injectedEnvKeys` (integration credentials resolved by the engine) are wired
 * into every apiRoutes-capable service as `${KEY}` references — injected at
 * generate time, NOT read from module manifests, so installed workspaces pick
 * up new integrations without reinstalling modules.
 */
export function buildComposeFile(
  config: RelayConfig,
  modules: ModuleManifest[],
  injectedEnvKeys: string[] = [],
): ComposeFile {
  const network = config.network.name;
  const services: Record<string, ComposeService> = {};
  const volumes: Record<string, Record<string, never>> = {};

  if (moduleNeedsPostgres(modules)) {
    services[POSTGRES_SERVICE] = {
      // pgvector image: Postgres + the `vector` extension, so the knowledge
      // base can store embeddings without swapping the image later.
      image: 'pgvector/pgvector:pg16',
      environment: {
        POSTGRES_USER: 'relay',
        POSTGRES_PASSWORD: '${POSTGRES_PASSWORD}',
        POSTGRES_DB: 'relay',
      },
      // Not published: Postgres stays on the internal network (the generated
      // compose is also the prod deployment). The runtime owns this volume and
      // its generated password, so a fresh volume always matches.
      volumes: [`${PGDATA_VOLUME}:/var/lib/postgresql/data`],
      networks: [network],
      restart: 'unless-stopped',
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U relay'],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      },
    };
    volumes[PGDATA_VOLUME] = {};
  }

  for (const module of [...modules].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const service of module.services) {
      const injected = module.capabilities.apiRoutes
        ? Object.fromEntries(
            injectedEnvKeys.map((key) => [key, `\${${key}:-}`]),
          )
        : {};
      services[service.name] = {
        image: service.image,
        command: service.command,
        environment: { ...injected, ...service.env },
        ports: service.ports,
        volumes: service.volumes,
        depends_on: service.dependsOn,
        networks: [network],
        restart: service.restart,
        healthcheck: service.healthcheck,
      };
    }
  }

  const compose: ComposeFile = {
    name: config.network.name,
    services,
    networks: { [network]: {} },
  };
  if (Object.keys(volumes).length > 0) compose.volumes = volumes;
  return compose;
}

export function serializeCompose(compose: ComposeFile): string {
  return stringify(compose, { sortMapEntries: false });
}

export function serializeEnv(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

/** Stable content hash for runtime.lock (drift detection). */
export function composeHash(composeYaml: string, envKeys: string[]): string {
  return createHash('sha256')
    .update(composeYaml)
    .update(' ')
    .update([...envKeys].sort().join(','))
    .digest('hex')
    .slice(0, 16);
}
