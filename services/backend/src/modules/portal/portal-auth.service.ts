import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { clients, type Client } from '../client/client.schema';
import { OutboxService } from '../outbox/outbox.service';
import { portalLoginTokens } from './portal.schema';

/** Outbox message type: send a portal sign-in link. */
export const PORTAL_LOGIN_EMAIL = 'notification.portal_login_email';

export interface PortalLoginEmailPayload {
  clientEmail: string;
  clientName: string;
  loginUrl: string;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_S = 30 * 24 * 60 * 60;

/**
 * Portal identity: email → single-use magic link → portal session token.
 *
 * Portal sessions are signed with a secret DERIVED from JWT_SECRET
 * (HMAC-tagged 'portal'), so a portal token can never pass the owner guard
 * and an owner token can never pass the portal guard — separation by
 * signature, not by claim-checking discipline.
 */
@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  portalSecret(): string {
    const base = this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', base).update('portal').digest('hex');
  }

  /**
   * Always resolves without revealing whether the email is a client —
   * account enumeration returns the same response either way.
   */
  async requestLink(email: string): Promise<void> {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.email, email.toLowerCase().trim()),
    });
    if (!client) {
      this.logger.log(`portal link requested for unknown email (ignored)`);
      return;
    }

    const { token, expiresAt } = this.newLoginToken();
    await this.db.transaction(async (tx) => {
      await tx.insert(portalLoginTokens).values({
        clientId: client.id,
        token,
        expiresAt,
      });
      const payload: PortalLoginEmailPayload = {
        clientEmail: client.email,
        clientName: client.name,
        loginUrl: this.loginUrl(token),
      };
      await this.outbox.enqueue(tx, PORTAL_LOGIN_EMAIL, { ...payload });
    });
  }

  /**
   * Owner-issued sign-in link: the same single-use, 15-minute token as the
   * emailed flow, but returned to the owner directly so they can paste it
   * into whatever channel the client is on — no SMTP dependency.
   */
  async issueLoginLink(
    clientId: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });
    if (!client) throw new NotFoundException('Unknown client.');

    const { token, expiresAt } = this.newLoginToken();
    await this.db.insert(portalLoginTokens).values({
      clientId: client.id,
      token,
      expiresAt,
    });
    return { url: this.loginUrl(token), expiresAt };
  }

  private newLoginToken(): { token: string; expiresAt: Date } {
    return {
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    };
  }

  private loginUrl(token: string): string {
    const portalUrl = this.config.get<string>(
      'PUBLIC_PORTAL_URL',
      'http://localhost:5174',
    );
    return `${portalUrl}/auth/${token}`;
  }

  /** Redeem a magic link: single-use, expiring, revocable by deletion. */
  async redeem(token: string): Promise<{ accessToken: string; client: Client }> {
    const redeemed = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(portalLoginTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(portalLoginTokens.token, token),
            isNull(portalLoginTokens.usedAt),
            gt(portalLoginTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      return row;
    });
    if (!redeemed) {
      throw new UnauthorizedException('This sign-in link is invalid or expired.');
    }

    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, redeemed.clientId),
    });
    if (!client) throw new UnauthorizedException('Unknown client.');

    return { accessToken: this.sign(client.id), client };
  }

  private sign(clientId: string): string {
    // Minimal HS256 JWT — avoids wiring a second JwtModule for one claim set.
    const b64 = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const now = Math.floor(Date.now() / 1000);
    const body = b64({ sub: clientId, aud: 'portal', iat: now, exp: now + SESSION_TTL_S });
    const signature = createHmac('sha256', this.portalSecret())
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  /** Verify a portal session token; returns the clientId or null. */
  verify(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts as [string, string, string];
    const expected = createHmac('sha256', this.portalSecret())
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature.length !== expected.length) return null;
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !a.equals(b)) return null;
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as { sub?: string; aud?: string; exp?: number };
      if (payload.aud !== 'portal') return null;
      if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
