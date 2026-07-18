import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthService, type AuthResult, type JwtPayload } from './auth.service';
import { LoginDto, RegisterOwnerDto } from './dto/auth.dto';
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

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
