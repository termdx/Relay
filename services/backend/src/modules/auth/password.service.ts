import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCHEME = 'scrypt';

/**
 * Password hashing via Node's built-in scrypt — a memory-hard KDF, no native
 * dependency (bcrypt/argon2 would add one, and native modules have already
 * cost us Docker build failures). Format: "scrypt$<saltHex>$<hashHex>".
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(password, salt, KEY_LENGTH);
    return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  /** Constant-time comparison; false on any malformed stored value. */
  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== SCHEME || !saltHex || !hashHex) return false;

    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(
      password,
      Buffer.from(saltHex, 'hex'),
      KEY_LENGTH,
    );
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  }
}
