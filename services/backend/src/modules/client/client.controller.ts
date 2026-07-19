import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PortalAuthService } from '../portal/portal-auth.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import type { Client } from './client.schema';
import { ClientService, type ClientWithProjects } from './client.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('clients')
export class ClientController {
  constructor(
    private readonly clients: ClientService,
    private readonly portalAuth: PortalAuthService,
  ) {}

  @Get()
  list(): Promise<ClientWithProjects[]> {
    return this.clients.list();
  }

  @Post()
  create(@Body() dto: CreateClientDto): Promise<Client> {
    return this.clients.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ClientWithProjects> {
    return this.clients.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientWithProjects> {
    return this.clients.update(id, dto);
  }

  /**
   * Owner-issued portal sign-in link — the email magic link without the
   * email. The owner pastes it into whatever channel the client is on.
   */
  @Post(':id/portal-link')
  issuePortalLink(
    @Param('id') id: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    return this.portalAuth.issueLoginLink(id);
  }
}
