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
