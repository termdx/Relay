import { Command } from 'commander';
import * as p from '@clack/prompts';
import { getClient, run } from '../context';

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate the workspace (deps, secrets, ports, capabilities)')
    .action(() => {
      run(async () => {
        const diagnostics = await getClient().validate(process.cwd());
        if (diagnostics.length === 0) {
          p.log.success('Workspace is valid — no problems found.');
          return;
        }
        for (const d of diagnostics) {
          const line = `[${d.code}] ${d.message}`;
          if (d.level === 'error') p.log.error(line);
          else p.log.warn(line);
        }
        const errors = diagnostics.filter((d) => d.level === 'error').length;
        p.log.info(`${errors} error(s), ${diagnostics.length - errors} warning(s).`);
        if (errors > 0) process.exitCode = 1;
      });
    });
}
