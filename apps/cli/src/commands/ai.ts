import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

const KEYED_PROVIDERS = new Set(['gemini', 'openai', 'anthropic', 'openrouter']);

interface AddOptions {
  id?: string;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  yes?: boolean;
}

export function registerAi(program: Command): void {
  const ai = program.command('ai').description('Manage AI providers');

  ai.command('add <provider>')
    .description('Install an AI provider (gemini, openai, anthropic, ollama, …)')
    .option('--id <id>', 'manifest id (defaults to provider)')
    .option('--api-key <key>', 'API key (stored in secrets, never in YAML)')
    .option('--endpoint <url>', 'custom endpoint (e.g. Ollama)')
    .option('--model <model>', 'default model')
    .option('-y, --yes', 'skip prompts')
    .action((provider: string, options: AddOptions) => {
      run(async () => {
        const client = getClient();
        let apiKey = options.apiKey;
        if (!apiKey && !options.yes && KEYED_PROVIDERS.has(provider)) {
          apiKey = ensure(
            await p.password({
              message: `${provider} API key`,
              validate: (v) => (v.length === 0 ? 'Required' : undefined),
            }),
          );
        }
        const summary = await client.ai.add({
          cwd: process.cwd(),
          provider,
          id: options.id,
          apiKey,
          endpoint: options.endpoint,
          defaultModel: options.model,
        });
        p.log.success(
          `Installed AI provider "${summary.id}" (${summary.provider})` +
            (summary.hasApiKey ? ' — key stored in secrets' : ''),
        );
      });
    });

  ai.command('list')
    .description('List installed AI providers')
    .action(() => {
      run(async () => {
        const providers = await getClient().ai.list(process.cwd());
        if (providers.length === 0) {
          p.log.info('No AI providers installed. Try: relay ai add gemini');
          return;
        }
        for (const provider of providers) {
          p.log.info(
            `${provider.id}  (${provider.provider})` +
              (provider.defaultModel ? `  default=${provider.defaultModel}` : '') +
              (provider.hasApiKey ? '  🔑' : ''),
          );
        }
      });
    });

  ai.command('info <id>')
    .description('Show an AI provider')
    .action((id: string) => {
      run(async () => {
        const provider = await getClient().ai.info(process.cwd(), id);
        p.log.info(JSON.stringify(provider, null, 2));
      });
    });

  ai.command('remove <id>')
    .description('Remove an AI provider (and its stored key)')
    .action((id: string) => {
      run(async () => {
        await getClient().ai.remove(process.cwd(), id);
        p.log.success(`Removed AI provider "${id}"`);
      });
    });

  ai.command('health <id>')
    .description('Probe an AI provider (live check)')
    .action((id: string) => {
      run(async () => {
        const health = await getClient().ai.health(process.cwd(), id);
        const line = `${health.id}: ${health.status}${health.detail ? ` — ${health.detail}` : ''}`;
        if (health.status === 'ok') p.log.success(line);
        else if (health.status === 'error') p.log.error(line);
        else p.log.warn(line);
        if (health.models?.length) {
          p.log.info(`  models: ${health.models.slice(0, 8).join(', ')}${health.models.length > 8 ? ' …' : ''}`);
        }
      });
    });

  ai.command('models <id>')
    .description('List a provider’s available models')
    .action((id: string) => {
      run(async () => {
        const models = await getClient().ai.models(process.cwd(), id);
        if (models.length === 0) p.log.info('No models reported.');
        for (const model of models) p.log.info(`  ${model}`);
      });
    });
}
