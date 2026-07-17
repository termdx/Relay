#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { registerAi } from './commands/ai';
import { registerDaemon } from './commands/daemon';
import { registerDoctor } from './commands/doctor';
import { registerInit } from './commands/init';
import { registerIntegration } from './commands/integration';
import { registerLifecycle } from './commands/lifecycle';
import { registerModule } from './commands/module';
import { registerValidate } from './commands/validate';

const program = new Command();

program
  .name('relay')
  .description('Relay Runtime — the control plane for a Relay workspace')
  .version('0.1.0')
  .option('-C, --cwd <dir>', 'run as if relay started in <dir>');

// Before any command: apply --cwd, then probe for a running daemon. If one
// answers, subsequent getClient() calls talk to it over HTTP.
program.hook('preAction', async (thisCommand) => {
  const cwd = thisCommand.opts().cwd as string | undefined;
  if (cwd) process.chdir(cwd);

  if (!process.env.RELAY_RUNTIME_URL) {
    const port = process.env.RELAY_RUNTIME_PORT ?? '51720';
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(300),
      });
      if (res.ok) process.env.RELAY_RUNTIME_URL = url;
    } catch {
      // no daemon — commands run in-process
    }
  }
});

registerInit(program);
registerAi(program);
registerModule(program);
registerIntegration(program);
registerLifecycle(program);
registerValidate(program);
registerDoctor(program);
registerDaemon(program);

program.parseAsync(process.argv);
