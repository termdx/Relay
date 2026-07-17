import { execa } from 'execa';

export interface ServiceStatus {
  name: string;
  service: string;
  state: string;
  health?: string;
}

export interface LogsOptions {
  service?: string;
  follow?: boolean;
  tail?: number;
}

/**
 * Drives `docker compose` against the generated compose file. The runtime never
 * asks the user to run docker directly — up/down/restart/logs/status all go
 * through here.
 */
export class ServiceLifecycle {
  constructor(
    private readonly composeFile: string,
    private readonly envFile: string,
    private readonly projectName: string,
  ) {}

  private args(...rest: string[]): string[] {
    return [
      'compose',
      '-f',
      this.composeFile,
      '--env-file',
      this.envFile,
      '-p',
      this.projectName,
      ...rest,
    ];
  }

  /** Validate the generated compose (no daemon required). */
  async config(): Promise<string> {
    const { stdout } = await execa('docker', this.args('config'));
    return stdout;
  }

  async up(): Promise<void> {
    await execa('docker', this.args('up', '-d'), { stdio: 'inherit' });
  }

  async down(): Promise<void> {
    await execa('docker', this.args('down'), { stdio: 'inherit' });
  }

  async restart(): Promise<void> {
    await execa('docker', this.args('restart'), { stdio: 'inherit' });
  }

  async logs(options: LogsOptions = {}): Promise<void> {
    const args = this.args(
      'logs',
      ...(options.tail ? ['--tail', String(options.tail)] : []),
      ...(options.follow ? ['--follow'] : []),
      ...(options.service ? [options.service] : []),
    );
    await execa('docker', args, { stdio: 'inherit' });
  }

  async status(): Promise<ServiceStatus[]> {
    const { stdout } = await execa('docker', this.args('ps', '--format', 'json'));
    if (!stdout.trim()) return [];
    // compose emits one JSON object per line
    return stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, string>)
      .map((row) => ({
        name: row.Name ?? '',
        service: row.Service ?? '',
        state: row.State ?? '',
        health: row.Health || undefined,
      }));
  }
}
