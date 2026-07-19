import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { AuthService, type AuthResult, type JwtPayload } from './auth.service';
import { PasswordService } from './password.service';
import { invites, users, type Invite } from './auth.schema';

/** What the desktop needs to connect to this deployment, if known. */
export interface ServerConnection {
  backendUrl: string;
  runtimeUrl: string;
  runtimeToken: string | null;
}

export interface InviteView {
  id: string;
  /** Join URL when the deployment knows its public base; else null. */
  url: string | null;
  expiresAt: Date;
  maxUses: number | null;
  usedCount: number;
  revoked: boolean;
  createdAt: Date;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Invite-link membership. The owner mints links; anyone holding a live link
 * self-registers with their own credentials — the owner never manages
 * teammate accounts. Raw tokens live only in the links; the DB keeps hashes.
 */
@Injectable()
export class InviteService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  /** Where this deployment lives publicly, if the runtime told us. */
  private publicBase(): string | null {
    return process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? null;
  }

  /** The connection bundle a joining desktop should adopt. */
  connection(): ServerConnection | null {
    const base = this.publicBase();
    if (!base) return null;
    return {
      backendUrl: `${base}/api`,
      runtimeUrl: `${base}/runtime`,
      runtimeToken: process.env.RELAY_RUNTIME_TOKEN ?? null,
    };
  }

  private assertOwner(user: JwtPayload): void {
    if (user.role !== 'owner') {
      throw new ForbiddenException('Only the owner can manage invites.');
    }
  }

  private toView(invite: Invite, token?: string): InviteView {
    const base = this.publicBase();
    return {
      id: invite.id,
      url: token && base ? `${base}/join/${token}` : null,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
      revoked: invite.revokedAt !== null,
      createdAt: invite.createdAt,
    };
  }

  async create(
    user: JwtPayload,
    maxUses?: number | null,
  ): Promise<InviteView & { token: string }> {
    this.assertOwner(user);
    const token = randomBytes(24).toString('base64url');
    const [invite] = await this.db
      .insert(invites)
      .values({
        tokenHash: hashToken(token),
        createdBy: user.sub,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        maxUses: maxUses ?? null,
      })
      .returning();
    return { ...this.toView(invite!, token), token };
  }

  async list(user: JwtPayload): Promise<InviteView[]> {
    this.assertOwner(user);
    const rows = await this.db
      .select()
      .from(invites)
      .orderBy(desc(invites.createdAt));
    return rows.map((r) => this.toView(r));
  }

  async revoke(user: JwtPayload, id: string): Promise<void> {
    this.assertOwner(user);
    const [row] = await this.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, id), isNull(invites.revokedAt)))
      .returning();
    if (!row) throw new NotFoundException('Invite not found (or already revoked).');
  }

  /** A live, redeemable invite for this raw token — or null. */
  private async liveInvite(token: string): Promise<Invite | null> {
    const invite = await this.db.query.invites.findFirst({
      where: eq(invites.tokenHash, hashToken(token)),
    });
    if (!invite) return null;
    if (invite.revokedAt) return null;
    if (invite.expiresAt.getTime() < Date.now()) return null;
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses)
      return null;
    return invite;
  }

  /** Public: lets the join screens show validity before asking for details. */
  async preview(token: string): Promise<{ valid: boolean }> {
    return { valid: (await this.liveInvite(token)) !== null };
  }

  /** Public: redeem a live invite into a brand-new member account. */
  async join(input: {
    token: string;
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResult & { server: ServerConnection | null }> {
    const invite = await this.liveInvite(input.token);
    if (!invite) {
      throw new ForbiddenException(
        'This invite link is no longer valid — ask the owner for a fresh one.',
      );
    }
    const email = input.email.toLowerCase();
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists — sign in instead.',
      );
    }
    const [user] = await this.db
      .insert(users)
      .values({
        email,
        name: input.name,
        passwordHash: await this.passwords.hash(input.password),
        role: 'member',
      })
      .returning();
    await this.db
      .update(invites)
      .set({ usedCount: invite.usedCount + 1 })
      .where(eq(invites.id, invite.id));
    const result = await this.auth.issueFor(user!);
    return { ...result, server: this.connection() };
  }
}
