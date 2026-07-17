#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { registerAi } from './commands/ai';
import { registerInit } from './commands/init';
import { registerIntegration } from './commands/integration';
import { registerModule } from './commands/module';
import { registerValidate } from './commands/validate';

const program = new Command();

program
  .name('relay')
  .description('Relay Runtime — the control plane for a Relay workspace')
  .version('0.1.0')
  .option('-C, --cwd <dir>', 'run as if relay started in <dir>');

// Apply --cwd before any command runs, so every command resolves the workspace
// from the requested directory.
program.hook('preAction', (thisCommand) => {
  const cwd = thisCommand.opts().cwd as string | undefined;
  if (cwd) process.chdir(cwd);
});

registerInit(program);
registerAi(program);
registerModule(program);
registerIntegration(program);
registerValidate(program);

program.parseAsync(process.argv);
