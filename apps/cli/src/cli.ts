#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { registerInit } from './commands/init';

const program = new Command();

program
  .name('relay')
  .description('Relay Runtime — the control plane for a Relay workspace')
  .version('0.1.0');

registerInit(program);

program.parseAsync(process.argv);
