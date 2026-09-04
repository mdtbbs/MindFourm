import {
  Controller, Get, Post, Param, Body, Req, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ServersService } from './servers.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Get('public')
  async getPublicServers() {
    return this.serversService.getPublicServers();
  }

  @Get('versions')
  async getAvailableVersions() {
    return this.serversService.getAvailableVersions();
  }

  @Get('templates')
  async getTemplates() {
    return this.serversService.getPublicTemplates();
  }

  @Get(':id/basic')
  async getServerBasic(@Param('id', ParseIntPipe) id: number) {
    return this.serversService.getServerBasic(id);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getUserServers(@Req() req: Request) {
    return this.serversService.getUserServers((req as any).user?.mindauth_id);
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  async applyServer(@Req() req: Request, @Body() body: { name: string; description: string; version: string; template_id: number }) {
    return this.serversService.applyServer((req as any).user?.mindauth_id, body);
  }
}
