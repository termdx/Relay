import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { PortalAuthService } from './portal-auth.service';
import { PortalClient, PortalGuard } from './portal.guard';
import { PortalService } from './portal.service';

class RequestLinkDto {
  @IsEmail()
  email!: string;
}

class RedeemDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

class PortalAskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;
}

/**
 * The client portal API. @Public() exempts the whole controller from the
 * global OWNER guard (an owner JWT is the wrong audience here); every data
 * route then sits behind PortalGuard and receives the authenticated
 * clientId — scoping is enforced in the service's SQL, never in the UI.
 */
@Public()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  @Post('auth/request-link')
  @HttpCode(202)
  async requestLink(@Body() dto: RequestLinkDto): Promise<{ status: string }> {
    await this.auth.requestLink(dto.email);
    // Same response whether or not the email is a client (no enumeration).
    return { status: 'If that email belongs to a client, a sign-in link is on its way.' };
  }

  @Post('auth/redeem')
  redeem(@Body() dto: RedeemDto) {
    return this.auth.redeem(dto.token);
  }

  @UseGuards(PortalGuard)
  @Get('me')
  me(@PortalClient() clientId: string) {
    return this.portal.me(clientId);
  }

  @UseGuards(PortalGuard)
  @Get('projects/:projectId/overview')
  overview(
    @PortalClient() clientId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.portal.overview(clientId, projectId);
  }

  @UseGuards(PortalGuard)
  @Get('projects/:projectId/feed')
  feed(
    @PortalClient() clientId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.portal.feed(clientId, projectId);
  }

  @UseGuards(PortalGuard)
  @Get('projects/:projectId/todos')
  todos(
    @PortalClient() clientId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.portal.todosFor(clientId, projectId);
  }

  @UseGuards(PortalGuard)
  @Get('projects/:projectId/decisions')
  decisions(
    @PortalClient() clientId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.portal.decisionsFor(clientId, projectId);
  }

  @UseGuards(PortalGuard)
  @Get('approvals')
  approvals(@PortalClient() clientId: string) {
    return this.portal.approvalsFor(clientId);
  }

  @UseGuards(PortalGuard)
  @Post('projects/:projectId/ask')
  ask(
    @PortalClient() clientId: string,
    @Param('projectId') projectId: string,
    @Body() dto: PortalAskDto,
  ) {
    return this.portal.ask(clientId, projectId, dto.question);
  }
}
