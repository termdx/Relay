import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService, type AuthResult, type JwtPayload } from './auth.service';
import { LoginDto, RegisterOwnerDto } from './dto/auth.dto';
import { CurrentUser, Public } from './public.decorator';
import type { PublicUser } from './auth.schema';

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
}
