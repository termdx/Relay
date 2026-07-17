import { resolve } from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

interface InitOptions {
  dir: string;
  name?: string;
  org?: string;
  mode?: string;
  yes?: boolean;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create a new Relay workspace')
    .option('--dir <dir>', 'workspace directory', '.')
    .option('--name <name>', 'organization name')
    .option('--org <org>', 'organization name (alias for --name)')
    .option('--mode <mode>', 'runtime mode: local | server')
    .option('-y, --yes', 'accept defaults and skip prompts')
    .action((options: InitOptions) => {
      run(async () => {
        const client = getClient();

        let organization = options.name ?? options.org;
        let mode = options.mode;
        let desktop = true;

        if (!options.yes) {
          p.intro('Initialize a Relay workspace');
          if (!organization) {
            organization = ensure(
              await p.text({
                message: 'Organization name',
                placeholder: 'My Agency',
                validate: (v) => (v.length === 0 ? 'Required' : undefined),
              }),
            );
          }
          if (!mode) {
            mode = ensure(
              await p.select({
                message: 'Runtime mode',
                options: [
                  { value: 'local', label: 'local (single machine)' },
                  { value: 'server', label: 'server (shared host)' },
                ],
                initialValue: 'local',
              }),
            ) as string;
          }
          desktop = ensure(
            await p.confirm({ message: 'Enable desktop integration?', initialValue: true }),
          );
        }

        organization ??= 'My Agency';
        const resolvedMode = (mode ?? 'local') as 'local' | 'server';

        const info = await client.workspace.init({
          // Resolve to absolute client-side: a relative dir sent to a running
          // daemon would otherwise resolve against the daemon's cwd, not ours.
          dir: resolve(options.dir),
          organization,
          mode: resolvedMode,
          desktop,
        });

        p.log.success(`Initialized Relay workspace for "${info.organization}"`);
        p.log.info(`  location: ${info.root}`);
        p.log.info(`  mode:     ${info.mode}`);
        p.log.info(`  API port: ${info.apiPort}`);
        if (!options.yes) p.outro('Next: relay ai add gemini');
      });
    });
}
