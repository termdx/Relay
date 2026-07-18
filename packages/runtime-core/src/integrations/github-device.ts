/**
 * GitHub OAuth device flow (RFC 8628) — the no-paste way to connect GitHub.
 * Device flow is designed for public clients: only a client id is needed (no
 * secret, no redirect server), so it works for a self-hosted desktop app.
 *
 * The runtime performs both legs server-side; the acquired token goes straight
 * into the encrypted secret store and is never returned to callers.
 */

export interface GithubDeviceStart {
  /** Opaque handle the caller passes back to poll(). */
  deviceCode: string;
  /** Short code the user types at verificationUri. */
  userCode: string;
  verificationUri: string;
  /** Seconds between polls (GitHub enforces this). */
  interval: number;
  /** Seconds until the code expires. */
  expiresIn: number;
}

export type GithubDevicePoll =
  | { status: 'pending'; interval: number }
  | { status: 'complete'; token: string }
  | { status: 'error'; message: string };

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

async function githubForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'GitHub does not recognize that client id — check the OAuth app and that "Enable Device Flow" is on.'
        : `GitHub device flow HTTP ${res.status}`,
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function startGithubDeviceFlow(
  clientId: string,
): Promise<GithubDeviceStart> {
  const data = await githubForm(DEVICE_CODE_URL, {
    client_id: clientId,
    scope: 'repo',
  });
  if (typeof data.device_code !== 'string') {
    throw new Error(
      `GitHub rejected the device-flow start: ${String(data.error_description ?? data.error ?? 'unknown error')}. ` +
        'Is the client id correct, with device flow enabled on the OAuth app?',
    );
  }
  return {
    deviceCode: data.device_code,
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri),
    interval: Number(data.interval ?? 5),
    expiresIn: Number(data.expires_in ?? 900),
  };
}

export async function pollGithubDeviceFlow(
  clientId: string,
  deviceCode: string,
): Promise<GithubDevicePoll> {
  const data = await githubForm(ACCESS_TOKEN_URL, {
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  if (typeof data.access_token === 'string') {
    return { status: 'complete', token: data.access_token };
  }
  switch (data.error) {
    case 'authorization_pending':
      return { status: 'pending', interval: 5 };
    case 'slow_down':
      return { status: 'pending', interval: Number(data.interval ?? 10) };
    case 'expired_token':
      return {
        status: 'error',
        message: 'The code expired — start the connection again.',
      };
    case 'access_denied':
      return {
        status: 'error',
        message: 'You declined the authorization on GitHub.',
      };
    default:
      return {
        status: 'error',
        message: String(data.error_description ?? data.error ?? 'unknown error'),
      };
  }
}
