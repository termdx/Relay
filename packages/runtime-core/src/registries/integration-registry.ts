import { UnknownCatalogItemError } from '../errors';
import type { ManifestStore } from '../manifest/manifest-store';
import type { SecretsProvider } from '../secrets/secrets-provider';
import type { IntegrationManifest } from '../schemas/integration';

export interface IntegrationHealthCheck {
  name: string;
  status: 'ok' | 'error' | 'unknown';
  detail?: string;
}

export interface IntegrationHealth {
  id: string;
  checks: IntegrationHealthCheck[];
}

/** Manages installed integrations (integrations/<id>.yaml) + their credentials. */
export class IntegrationRegistry {
  constructor(
    private readonly store: ManifestStore<IntegrationManifest>,
    private readonly catalog: Record<string, IntegrationManifest>,
    private readonly secrets: SecretsProvider,
  ) {}

  catalogItems(): IntegrationManifest[] {
    return Object.values(this.catalog);
  }

  list(): Promise<IntegrationManifest[]> {
    return this.store.readAll();
  }

  info(id: string): Promise<IntegrationManifest> {
    return this.store.read(id);
  }

  installedIds(): Promise<string[]> {
    return this.store.list();
  }

  /** Install an integration, storing supplied credential values as secrets.
   * Upserts: re-adding an installed integration updates its credentials
   * (reconnects must never crash and strand a freshly granted token). */
  async add(
    id: string,
    credentials: Record<string, string>,
  ): Promise<IntegrationManifest> {
    const template = this.catalog[id];
    if (!template) throw new UnknownCatalogItemError('integration', id);

    for (const field of template.credentials) {
      const value = credentials[field.name];
      if (value) await this.secrets.set(field.secretRef, value);
    }
    await this.store.write(template);
    return template;
  }

  async remove(id: string): Promise<void> {
    const manifest = await this.store.read(id);
    for (const field of manifest.credentials) {
      await this.secrets.delete(field.secretRef);
    }
    await this.store.remove(id);
  }

  async health(id: string): Promise<IntegrationHealth> {
    const manifest = await this.store.read(id);
    const checks = await Promise.all(
      manifest.healthChecks.map((check) => this.runCheck(check.name, check.type, check.target)),
    );
    return { id, checks };
  }

  private async runCheck(
    name: string,
    type: 'http' | 'tcp' | 'command',
    target: string,
  ): Promise<IntegrationHealthCheck> {
    if (type !== 'http') {
      return { name, status: 'unknown', detail: `${type} check not implemented` };
    }
    try {
      const res = await fetch(target, { method: 'GET' });
      return res.status < 500
        ? { name, status: 'ok', detail: `HTTP ${res.status}` }
        : { name, status: 'error', detail: `HTTP ${res.status}` };
    } catch (error) {
      return {
        name,
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
