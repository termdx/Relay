import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

interface AddOptions {
  yes?: boolean;
}

export function registerModule(program: Command): void {
  const module = program.command('module').description('Manage modules');

  module
    .command('list')
    .description('List installed modules')
    .action(() => {
      run(async () => {
        const modules = await getClient().modules.list(process.cwd());
        if (modules.length === 0) {
          p.log.info('No modules installed. Try: relay module add meeting');
          return;
        }
        for (const m of modules) {
          p.log.info(
            `${m.id}  v${m.version}` +
              (m.dependencies.length ? `  deps: ${m.dependencies.join(', ')}` : ''),
          );
        }
      });
    });

  module
    .command('catalog')
    .description('List modules available to install')
    .action(() => {
      run(async () => {
        const items = await getClient().modules.catalog(process.cwd());
        for (const m of items) {
          p.log.info(
            `${m.id}  — ${m.displayName ?? ''}` +
              (m.dependencies.length ? `  (needs: ${m.dependencies.join(', ')})` : ''),
          );
        }
      });
    });

  module
    .command('info <id>')
    .description('Show a module manifest')
    .action((id: string) => {
      run(async () => {
        p.log.info(JSON.stringify(await getClient().modules.info(process.cwd(), id), null, 2));
      });
    });

  module
    .command('new <id>')
    .description('Scaffold a new custom module')
    .option('--name <name>', 'display name')
    .option('--description <text>', 'description')
    .option('--ui', 'exposes UI')
    .option('--api', 'exposes API routes')
    .option('--storage', 'requires storage')
    .option('--ai', 'requires AI')
    .option('-y, --yes', 'skip prompts')
    .action(
      (
        id: string,
        options: {
          name?: string;
          description?: string;
          ui?: boolean;
          api?: boolean;
          storage?: boolean;
          ai?: boolean;
          yes?: boolean;
        },
      ) => {
        run(async () => {
          let capabilities = {
            ui: Boolean(options.ui),
            apiRoutes: Boolean(options.api),
            storage: Boolean(options.storage),
            ai: Boolean(options.ai),
          };
          if (!options.yes && !options.ui && !options.api && !options.storage && !options.ai) {
            const picked = ensure(
              await p.multiselect({
                message: 'What does this module expose?',
                options: [
                  { value: 'ui', label: 'UI' },
                  { value: 'apiRoutes', label: 'API routes' },
                  { value: 'storage', label: 'Storage' },
                  { value: 'ai', label: 'AI' },
                ],
                required: false,
              }),
            ) as string[];
            capabilities = {
              ui: picked.includes('ui'),
              apiRoutes: picked.includes('apiRoutes'),
              storage: picked.includes('storage'),
              ai: picked.includes('ai'),
            };
          }
          const manifest = await getClient().modules.create(process.cwd(), {
            id,
            displayName: options.name,
            description: options.description,
            capabilities,
          });
          p.log.success(`Created module "${manifest.id}" (+ scaffold)`);
        });
      },
    );

  module
    .command('add <id>')
    .description('Install a module (resolves dependencies)')
    .option('-y, --yes', 'install dependencies without asking')
    .action((id: string, options: AddOptions) => {
      run(async () => {
        const client = getClient();
        const plan = await client.modules.plan(process.cwd(), id);
        const deps = plan.order.filter((m) => m !== id);

        if (deps.length > 0) {
          const ok = options.yes
            ? true
            : ensure(
                await p.confirm({
                  message: `"${id}" also needs: ${deps.join(', ')}. Install them too?`,
                  initialValue: true,
                }),
              );
          if (!ok) {
            p.log.warn('Aborted — no changes made.');
            return;
          }
        }

        const result = await client.modules.add(process.cwd(), id, true);
        if (result.order.length === 0) {
          p.log.info(`"${id}" is already installed.`);
        } else {
          p.log.success(`Installed: ${result.order.join(', ')}`);
        }
        if (result.missingIntegrations.length) {
          p.log.warn(
            `Needs integrations: ${result.missingIntegrations.join(', ')} — relay integration add <id>`,
          );
        }
        if (result.missingAiCapabilities.length) {
          p.log.warn(
            `Needs AI capabilities: ${result.missingAiCapabilities.join(', ')} — relay ai add <provider>`,
          );
        }
      });
    });

  module
    .command('remove <id>')
    .description('Remove a module (refused if others depend on it)')
    .action((id: string) => {
      run(async () => {
        await getClient().modules.remove(process.cwd(), id);
        p.log.success(`Removed module "${id}"`);
      });
    });
}
