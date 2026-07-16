import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { renderApprovalPage } from './approval-page';
import { ApprovalService } from './approval.service';
import { RespondApprovalDto } from './dto/respond-approval.dto';

/**
 * Public, unauthenticated endpoints — the magic-link token IS the credential.
 * Serves the client's approval page and records their decision. No account,
 * no login, no install (the deliberate answer to the client cold-start).
 */
@Controller('approve')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async page(@Param('token') token: string): Promise<string> {
    const approval = await this.approvals.getByToken(token);
    return renderApprovalPage(approval);
  }

  @Post(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async respond(
    @Param('token') token: string,
    @Body() dto: RespondApprovalDto,
  ): Promise<string> {
    const approval = await this.approvals.respond(
      token,
      dto.decision,
      dto.comment ?? null,
    );
    return renderApprovalPage(approval);
  }
}
