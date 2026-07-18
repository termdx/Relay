import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify GitHub's X-Hub-Signature-256 header against the raw request body.
 * Constant-time comparison; any malformed input is a clean false, never a
 * throw — unverifiable payloads are dropped (security.md).
 */
export function verifyGithubSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
