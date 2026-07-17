import { Command } from 'commander';
import * as p from '@clack/prompts';
import { getClient, run } from '../context';

interface LogsOptions {
  service?: string;
  follow?: boolean;
  tail?: string;
}

export function registerLifecycle(program: Command): void {
  program
    .command('generate')
    .description('Generate docker-compose.yml + .env + runtime.lock (no start)')
    .action(() => {
      run(async () => {
        const result = await getClient().compose.generate(process.cwd());
        p.log.success(`Generated compose for: ${result.services.join(', ')}`);
        p.log.info(`  AI provider: ${result.aiProvider ?? 'none (stub)'}`);
        p.log.info(`  ${result.composePath}`);
      });
    });

  program
    .command('up')
    .description('Generate compose and start the runtime')
    .action(() => {
      run(async () => {
        const result = await getClient().runtime.up(process.cwd());
        p.log.success(`Runtime up — services: ${result.services.join(', ')}`);
      });
    });

  program
    .command('down')
    .description('Stop the runtime')
    .action(() => {
      run(async () => {
        await getClient().runtime.down(process.cwd());
        p.log.success('Runtime stopped.');
      });
    });

  program
    .command('restart')
    .description('Restart the runtime')
    .action(() => {
      run(async () => {
        await getClient().runtime.restart(process.cwd());
        p.log.success('Runtime restarted.');
      });
    });

  program
    .command('logs')
    .description('Show runtime logs')
    .option('-s, --service <service>', 'a single service')
    .option('-f, --follow', 'follow log output')
    .option('--tail <n>', 'lines from the end of the logs')
    .action((options: LogsOptions) => {
      run(async () => {
        await getClient().runtime.logs(process.cwd(), {
          service: options.service,
          follow: options.follow,
          tail: options.tail ? Number(options.tail) : undefined,
        });
      });
    });
}
