/**
 * Secret storage. Manifests hold only *references* (see secretRefSchema); the
 * values live here, never in YAML. v1 ships an encrypted-file backend; the
 * interface leaves room for OS keychain / Docker secrets / Vault later.
 */
export interface SecretsProvider {
  get(ref: string): Promise<string | undefined>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
  /** Returns references only — never values. */
  list(): Promise<string[]>;
}
