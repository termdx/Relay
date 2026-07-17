import { Command } from 'commander';
import * as p from '@clack/prompts';
import { startRuntimeServer } from '@relay/runtime';
import { run } from '../context';

interface StartOptions {
  port?: string;
}

export function registerDaemon(program: Command): void {
  const daemon = program.command('daemon').description('Manage the Runtime API daemon');

  daemon
    .command('start')
    .description('Start the Runtime API daemon (foreground)')
    .option('--port <port>', 'port to listen on')
    .action((options: StartOptions) => {
      run(async () => {
        const port = Number(
          options.port ?? process.env.RELAY_RUNTIME_PORT ?? 51720,
        );
        await startRuntimeServer(port);
        p.log.success(`Relay Runtime API listening on http://127.0.0.1:${port}`);
        p.log.info('Clients (CLI, Desktop) will use this daemon. Ctrl-C to stop.');
      });
    });
}
