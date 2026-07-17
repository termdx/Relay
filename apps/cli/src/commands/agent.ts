import { Command } from 'commander';
import * as p from '@clack/prompts';
import { ensure, getClient, run } from '../context';

interface NewOptions {
  name?: string;
  model?: string;
  tools?: string;
  workflow?: string;
  memory?: string;
  yes?: boolean;
}

export function registerAgent(program: Command): void {
  const agent = program.command('agent').description('Manage LangGraph agents');

  agent
    .command('new <id>')
    .description('Scaffold a new agent definition')
    .option('--name <name>', 'display name')
    .option('--model <model>', 'provider/model, e.g. gemini/gemini-2.5-flash')
    .option('--tools <csv>', 'comma-separated tool names')
    .option('--workflow <workflow>', 'linked workflow')
    .option('--memory <kind>', 'none | buffer | vector')
    .option('-y, --yes', 'skip prompts')
    .action((id: string, options: NewOptions) => {
      run(async () => {
        let name = options.name;
        let model = options.model;
        if (!options.yes) {
          if (!name) {
            name = ensure(await p.text({ message: 'Agent name', placeholder: id }));
          }
          if (!model) {
            model = ensure(
              await p.text({
                message: 'Model (provider/model)',
                placeholder: 'gemini/gemini-2.5-flash',
              }),
            );
          }
        }
        const memory = (options.memory ?? 'none') as 'none' | 'buffer' | 'vector';
        const manifest = await getClient().agents.create(process.cwd(), {
          id,
          name: name || id,
          model: model || 'gemini/gemini-2.5-flash',
          tools: options.tools ? options.tools.split(',').map((t) => t.trim()) : [],
          workflow: options.workflow,
          memory,
        });
        p.log.success(`Created agent "${manifest.id}" (+ LangGraph scaffold)`);
      });
    });

  agent
    .command('list')
    .description('List agents')
    .action(() => {
      run(async () => {
        const items = await getClient().agents.list(process.cwd());
        if (items.length === 0) {
          p.log.info('No agents. Try: relay agent new summarizer');
          return;
        }
        for (const a of items) {
          p.log.info(`${a.id}  (${a.model})${a.workflow ? `  workflow: ${a.workflow}` : ''}`);
        }
      });
    });

  agent
    .command('validate')
    .description('Validate agent references')
    .action(() => {
      run(async () => {
        const diagnostics = (await getClient().validate(process.cwd())).filter(
          (d) => d.code.includes('AGENT'),
        );
        if (diagnostics.length === 0) {
          p.log.success('Agents are valid.');
          return;
        }
        for (const d of diagnostics) {
          if (d.level === 'error') p.log.error(`[${d.code}] ${d.message}`);
          else p.log.warn(`[${d.code}] ${d.message}`);
        }
        if (diagnostics.some((d) => d.level === 'error')) process.exitCode = 1;
      });
    });

  agent
    .command('remove <id>')
    .description('Remove an agent')
    .action((id: string) => {
      run(async () => {
        await getClient().agents.remove(process.cwd(), id);
        p.log.success(`Removed agent "${id}"`);
      });
    });
}
