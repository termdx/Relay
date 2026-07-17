import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

interface AddOptions {
  token?: string;
  yes?: boolean;
}

export function registerIntegration(program: Command): void {
  const integration = program
    .command('integration')
    .description('Manage integrations');

  integration
    .command('list')
    .description('List installed integrations')
    .action(() => {
      run(async () => {
        const items = await getClient().integrations.list(process.cwd());
        if (items.length === 0) {
          p.log.info('No integrations installed. Try: relay integration add github');
          return;
        }
        for (const i of items) {
          p.log.info(`${i.id}  ${i.displayName ?? ''}`);
        }
      });
    });

  integration
    .command('catalog')
    .description('List integrations available to install')
    .action(() => {
      run(async () => {
        const items = await getClient().integrations.catalog(process.cwd());
        for (const i of items) {
          p.log.info(`${i.id}  — ${i.displayName ?? ''}`);
        }
      });
    });

  integration
    .command('info <id>')
    .description('Show an integration manifest')
    .action((id: string) => {
      run(async () => {
        p.log.info(
          JSON.stringify(await getClient().integrations.info(process.cwd(), id), null, 2),
        );
      });
    });

  integration
    .command('add <id>')
    .description('Install an integration and store its credentials')
    .option('--token <token>', 'credential value (non-interactive)')
    .option('-y, --yes', 'skip prompts')
    .action((id: string, options: AddOptions) => {
      run(async () => {
        const client = getClient();
        const template = (await client.integrations.catalog(process.cwd())).find(
          (i) => i.id === id,
        );
        if (!template) {
          p.log.error(`Unknown integration "${id}". See: relay integration catalog`);
          process.exitCode = 1;
          return;
        }

        const credentials: Record<string, string> = {};
        for (const field of template.credentials) {
          let value =
            options.token && field.name === 'token' ? options.token : undefined;
          if (!value && !options.yes) {
            value = ensure(
              await p.password({
                message: `${id} ${field.name}`,
                validate: (v) => (field.required && !v ? 'Required' : undefined),
              }),
            );
          }
          if (value) credentials[field.name] = value;
        }

        await client.integrations.add(process.cwd(), id, credentials);
        p.log.success(`Installed integration "${id}" — credentials stored in secrets`);
      });
    });

  integration
    .command('remove <id>')
    .description('Remove an integration (and its stored credentials)')
    .action((id: string) => {
      run(async () => {
        await getClient().integrations.remove(process.cwd(), id);
        p.log.success(`Removed integration "${id}"`);
      });
    });

  integration
    .command('health <id>')
    .description('Run an integration’s health checks')
    .action((id: string) => {
      run(async () => {
        const health = await getClient().integrations.health(process.cwd(), id);
        if (health.checks.length === 0) {
          p.log.info(`No health checks defined for "${id}".`);
          return;
        }
        for (const check of health.checks) {
          const line = `${check.name}: ${check.status}${check.detail ? ` — ${check.detail}` : ''}`;
          if (check.status === 'ok') p.log.success(line);
          else if (check.status === 'error') p.log.error(line);
          else p.log.warn(line);
        }
      });
    });
}
