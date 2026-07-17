import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../validation/validator';
import { computeOverall, type EnvironmentHealth } from './health-monitor';

const healthy: EnvironmentHealth = {
  dockerCli: { ok: true },
  dockerDaemon: { ok: true },
  compose: { ok: true },
};

const err = (): Diagnostic => ({ level: 'error', code: 'X', message: 'x' });
const warn = (): Diagnostic => ({ level: 'warning', code: 'Y', message: 'y' });

describe('computeOverall', () => {
  it('ok when everything is up and no diagnostics', () => {
    expect(computeOverall(healthy, [])).toBe('ok');
  });

  it('degraded when the daemon is down but nothing errors', () => {
    expect(
      computeOverall({ ...healthy, dockerDaemon: { ok: false } }, []),
    ).toBe('degraded');
  });

  it('degraded when there are only warnings', () => {
    expect(computeOverall(healthy, [warn()])).toBe('degraded');
  });

  it('error when a diagnostic errors', () => {
    expect(computeOverall(healthy, [err()])).toBe('error');
  });

  it('error when the docker CLI is missing entirely', () => {
    expect(computeOverall({ ...healthy, dockerCli: { ok: false } }, [])).toBe('error');
  });
});
