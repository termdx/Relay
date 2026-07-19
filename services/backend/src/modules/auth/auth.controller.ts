import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthService, type AuthResult, type JwtPayload } from './auth.service';
import { LoginDto, RegisterOwnerDto } from './dto/auth.dto';
import {
  InviteService,
  type InviteView,
  type ServerConnection,
} from './invite.service';
import { CurrentUser, Public } from './public.decorator';
import type { PublicUser } from './auth.schema';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  /** data:image/… or https URL; empty string clears. Sized for ~1MB base64. */
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  avatar?: string;
}

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}

export class JoinDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password!: string;
}

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitesSvc: InviteService,
  ) {}

  /** Lets the desktop decide between first-run setup and login. */
  @Public()
  @Get('status')
  async status(): Promise<{ needsSetup: boolean }> {
    return { needsSetup: await this.auth.needsSetup() };
  }

  /** First-run only: creates the owner account. */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterOwnerDto): Promise<AuthResult> {
    return this.auth.registerOwner(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<PublicUser> {
    return this.auth.findById(user.sub);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.auth.updateProfile(user.sub, dto);
  }

  // ── team ──────────────────────────────────────────────────────────────

  @Get('members')
  members(): Promise<PublicUser[]> {
    return this.auth.listUsers();
  }

  /** Owner-only: mint an invite link (the raw token appears only here). */
  @Post('invites')
  createInvite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInviteDto,
  ): Promise<InviteView & { token: string }> {
    return this.invitesSvc.create(user, dto.maxUses);
  }

  @Get('invites')
  listInvites(@CurrentUser() user: JwtPayload): Promise<InviteView[]> {
    return this.invitesSvc.list(user);
  }

  @Delete('invites/:id')
  revokeInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.invitesSvc.revoke(user, id);
  }

  /** Public: join screens check the link before asking for details. */
  @Public()
  @Get('invite-preview')
  previewInvite(@Query('token') token = ''): Promise<{ valid: boolean }> {
    return this.invitesSvc.preview(token);
  }

  /** Public: redeem an invite into a new member account + connection info. */
  @Public()
  @Post('join')
  join(
    @Body() dto: JoinDto,
  ): Promise<AuthResult & { server: ServerConnection | null }> {
    return this.invitesSvc.join(dto);
  }
}
