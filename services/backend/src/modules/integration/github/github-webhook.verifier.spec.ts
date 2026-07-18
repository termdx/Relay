import { createHmac } from 'node:crypto';
import { verifyGithubSignature } from './github-webhook.verifier';

describe('verifyGithubSignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from('{"action":"opened"}');
  const sign = (s: string, b: Buffer) =>
    `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;

  it('accepts a valid signature', () => {
    expect(verifyGithubSignature(secret, body, sign(secret, body))).toBe(true);
  });

  it('rejects a signature from the wrong secret', () => {
    expect(verifyGithubSignature(secret, body, sign('other', body))).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from('{"action":"closed"}');
    expect(verifyGithubSignature(secret, tampered, sign(secret, body))).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false);
    expect(verifyGithubSignature(secret, body, 'sha1=abc')).toBe(false);
    expect(verifyGithubSignature(secret, body, 'sha256=nothex')).toBe(false);
    expect(verifyGithubSignature(secret, body, 'sha256=')).toBe(false);
  });
});
