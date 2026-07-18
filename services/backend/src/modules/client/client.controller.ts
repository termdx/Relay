import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import type { Client } from './client.schema';
import { ClientService, type ClientWithProjects } from './client.service';

/** Thin controller: validate, invoke service, return. No business logic. */
@Controller('clients')
export class ClientController {
  constructor(private readonly clients: ClientService) {}

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
}
