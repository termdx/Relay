import { Command } from 'commander';
import * as p from '@clack/prompts';
import type { RuntimeHealth } from '@relay/runtime-core';
import { getClient, run } from '../context';

function line(label: string, ok: boolean, detail?: string): string {
  return `${ok ? '✔' : '✖'} ${label}${detail ? ` — ${detail}` : ''}`;
}

function reportOverall(overall: RuntimeHealth['overall']): void {
  const text = `Overall: ${overall}`;
  if (overall === 'ok') p.log.success(text);
  else if (overall === 'degraded') p.log.warn(text);
  else p.log.error(text);
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check environment prerequisites and workspace integrity')
    .action(() => {
      run(async () => {
        const health = await getClient().health(process.cwd());
        const e = health.environment;

        p.log.info(line('Docker CLI', e.dockerCli.ok, e.dockerCli.detail));
        p.log.info(line('Docker daemon', e.dockerDaemon.ok, e.dockerDaemon.detail));
        p.log.info(line('Docker Compose', e.compose.ok, e.compose.detail));

        if (health.diagnostics.length === 0) {
          p.log.success('Workspace: valid');
        } else {
          for (const d of health.diagnostics) {
            const text = `  [${d.code}] ${d.message}`;
            if (d.level === 'error') p.log.error(text);
            else p.log.warn(text);
          }
        }

        reportOverall(health.overall);
        if (health.overall === 'error') process.exitCode = 1;
      });
    });

  program
    .command('status')
    .description('Show runtime status: modules, integrations, providers, services')
    .action(() => {
      run(async () => {
        const client = getClient();
        const cwd = process.cwd();
        const [info, modules, integrations, providers, health] = await Promise.all([
          client.workspace.info(cwd),
          client.modules.list(cwd),
          client.integrations.list(cwd),
          client.ai.list(cwd),
          client.health(cwd),
        ]);

        p.log.info(`Organization : ${info.organization}`);
        p.log.info(`Mode         : ${info.mode}`);
        p.log.info(`Modules      : ${modules.map((m) => m.id).join(', ') || '—'}`);
        p.log.info(`Integrations : ${integrations.map((i) => i.id).join(', ') || '—'}`);
        p.log.info(`AI providers : ${providers.map((pr) => pr.id).join(', ') || '—'}`);

        if (health.services.length > 0) {
          p.log.info('Services     :');
          for (const s of health.services) {
            p.log.info(
              `  ${s.service.padEnd(12)} ${s.state}${s.health ? ` (${s.health})` : ''}`,
            );
          }
        } else {
          p.log.info('Services     : not running');
        }

        reportOverall(health.overall);
      });
    });
}
