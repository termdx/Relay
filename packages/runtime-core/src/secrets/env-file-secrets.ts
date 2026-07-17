import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretsProvider } from './secrets-provider';

const ALGORITHM = 'aes-256-gcm';

interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

/**
 * Encrypted-at-rest secrets file (AES-256-GCM). The key lives in a sibling
 * 0600 key file. This is a v1 baseline — better than plaintext, honest about
 * its limits (key adjacent to ciphertext). Real deployments should bind a
 * keychain/Vault backend to the SecretsProvider interface.
 */
export class EnvFileSecrets implements SecretsProvider {
  constructor(
    private readonly keyPath: string,
    private readonly blobPath: string,
  ) {}

  private async getKey(): Promise<Buffer> {
    try {
      return Buffer.from(await readFile(this.keyPath, 'utf8'), 'hex');
    } catch {
      const key = randomBytes(32);
      await mkdir(dirname(this.keyPath), { recursive: true });
      await writeFile(this.keyPath, key.toString('hex'), { mode: 0o600 });
      return key;
    }
  }

  private async load(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.blobPath, 'utf8');
    } catch {
      return {};
    }
    const blob = JSON.parse(raw) as EncryptedBlob;
    const key = await this.getKey();
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(blob.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(blob.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(blob.data, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, string>;
  }

  private async save(map: Record<string, string>): Promise<void> {
    const key = await this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(map), 'utf8'),
      cipher.final(),
    ]);
    const blob: EncryptedBlob = {
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      data: encrypted.toString('hex'),
    };
    await mkdir(dirname(this.blobPath), { recursive: true });
    await writeFile(this.blobPath, JSON.stringify(blob), { mode: 0o600 });
  }

  async get(ref: string): Promise<string | undefined> {
    return (await this.load())[ref];
  }

  async set(ref: string, value: string): Promise<void> {
    const map = await this.load();
    map[ref] = value;
    await this.save(map);
  }

  async delete(ref: string): Promise<void> {
    const map = await this.load();
    delete map[ref];
    await this.save(map);
  }

  async list(): Promise<string[]> {
    return Object.keys(await this.load()).sort();
  }
}
