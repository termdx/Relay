import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

interface NewOptions {
  name?: string;
  description?: string;
  module?: string;
  yes?: boolean;
}

export function registerWorkflow(program: Command): void {
  const workflow = program.command('workflow').description('Manage workflows');

  workflow
    .command('new <id>')
    .description('Scaffold a new workflow definition')
    .option('--name <name>', 'display name')
    .option('--description <text>', 'description')
    .option('--module <module>', 'owning module')
    .option('-y, --yes', 'skip prompts')
    .action((id: string, options: NewOptions) => {
      run(async () => {
        let displayName = options.name;
        if (!displayName && !options.yes) {
          displayName = ensure(
            await p.text({ message: 'Display name', placeholder: id }),
          );
        }
        const manifest = await getClient().workflows.create(process.cwd(), {
          id,
          displayName: displayName || id,
          description: options.description,
          module: options.module,
        });
        p.log.success(`Created workflow "${manifest.id}" (+ scaffold)`);
      });
    });

  workflow
    .command('list')
    .description('List workflows')
    .action(() => {
      run(async () => {
        const items = await getClient().workflows.list(process.cwd());
        if (items.length === 0) {
          p.log.info('No workflows. Try: relay workflow new meeting-processing');
          return;
        }
        for (const w of items) {
          p.log.info(`${w.id}${w.module ? `  (module: ${w.module})` : ''}`);
        }
      });
    });

  workflow
    .command('validate')
    .description('Validate workflow references')
    .action(() => {
      run(async () => {
        const diagnostics = (await getClient().validate(process.cwd())).filter(
          (d) => d.code.includes('WORKFLOW'),
        );
        if (diagnostics.length === 0) {
          p.log.success('Workflows are valid.');
          return;
        }
        for (const d of diagnostics) p.log.error(`[${d.code}] ${d.message}`);
        process.exitCode = 1;
      });
    });

  workflow
    .command('run <id>')
    .description('Run a workflow')
    .action((id: string) => {
      run(async () => {
        await getClient().workflows.info(process.cwd(), id); // ensures it exists
        p.log.warn(
          `Execution engine (Temporal) is not wired yet — "${id}" validated but not run. (deferred)`,
        );
      });
    });

  workflow
    .command('remove <id>')
    .description('Remove a workflow')
    .action((id: string) => {
      run(async () => {
        await getClient().workflows.remove(process.cwd(), id);
        p.log.success(`Removed workflow "${id}"`);
      });
    });
}
