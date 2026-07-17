import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type RelayDb } from '../../database/drizzle.provider';
import { LoginDto, RegisterOwnerDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { toPublicUser, users, type PublicUser, type User } from './auth.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: RelayDb,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  /** True while no account exists — the desktop shows first-run setup. */
  async needsSetup(): Promise<boolean> {
    const rows = await this.db.select({ id: users.id }).from(users).limit(1);
    return rows.length === 0;
  }

  /**
   * First-run bootstrap: creates the owner. Only permitted while the instance
   * has no users, so a self-hosted deployment can't be claimed by a stranger
   * once it's set up.
   */
  async registerOwner(dto: RegisterOwnerDto): Promise<AuthResult> {
    if (!(await this.needsSetup())) {
      throw new ForbiddenException(
        'Setup is already complete — ask the owner for an invite.',
      );
    }
    const [user] = await this.db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash: await this.passwords.hash(dto.password),
        role: 'owner',
      })
      .returning();
    return this.issue(user!);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email.toLowerCase()),
    });
    // Same error whether the email is unknown or the password is wrong.
    if (!user || !(await this.passwords.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.issue(user);
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    return toPublicUser(user);
  }

  private async issue(user: User): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: toPublicUser(user),
    };
  }
}
