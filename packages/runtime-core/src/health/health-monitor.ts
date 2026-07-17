import { execa } from 'execa';
import type {
  ServiceLifecycle,
  ServiceStatus,
} from '../lifecycle/service-lifecycle';
import type { Diagnostic } from '../validation/validator';

export interface CheckResult {
  ok: boolean;
  detail?: string;
}

export interface EnvironmentHealth {
  dockerCli: CheckResult;
  dockerDaemon: CheckResult;
  compose: CheckResult;
}

export interface RuntimeHealth {
  environment: EnvironmentHealth;
  services: ServiceStatus[];
  diagnostics: Diagnostic[];
  overall: 'ok' | 'degraded' | 'error';
}

function shortMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'shortMessage' in error) {
    return String((error as { shortMessage: unknown }).shortMessage);
  }
  return error instanceof Error ? error.message : String(error);
}

async function checkDocker(args: string[]): Promise<CheckResult> {
  try {
    const { stdout } = await execa('docker', args);
    return { ok: true, detail: stdout.split('\n')[0]?.trim() || undefined };
  } catch (error) {
    return { ok: false, detail: shortMessage(error) };
  }
}

export async function checkEnvironment(): Promise<EnvironmentHealth> {
  const dockerDaemon = await checkDocker(['info', '--format', '{{.ServerVersion}}']);
  return {
    dockerCli: await checkDocker(['--version']),
    dockerDaemon: dockerDaemon.ok
      ? dockerDaemon
      : { ok: false, detail: 'not running — start Docker and retry' },
    compose: await checkDocker(['compose', 'version', '--short']),
  };
}

/** Aggregate status: error if a hard prerequisite/diagnostic fails, degraded
 * if the daemon is down or there are non-error diagnostics, else ok. */
export function computeOverall(
  environment: EnvironmentHealth,
  diagnostics: Diagnostic[],
): RuntimeHealth['overall'] {
  const errors =
    diagnostics.filter((d) => d.level === 'error').length +
    (environment.dockerCli.ok ? 0 : 1);
  if (errors > 0) return 'error';
  if (!environment.dockerDaemon.ok || diagnostics.length > 0) return 'degraded';
  return 'ok';
}

/**
 * Assemble the full runtime health picture: environment prerequisites, running
 * services (only probed if the daemon is up), and workspace diagnostics.
 */
export async function inspectHealth(
  lifecycle: ServiceLifecycle,
  diagnostics: Diagnostic[],
): Promise<RuntimeHealth> {
  const environment = await checkEnvironment();

  let services: ServiceStatus[] = [];
  if (environment.dockerDaemon.ok) {
    try {
      services = await lifecycle.status();
    } catch {
      services = [];
    }
  }

  return {
    environment,
    services,
    diagnostics,
    overall: computeOverall(environment, diagnostics),
  };
}
