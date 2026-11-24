import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaidGuard } from './paid.guard';
import { ClansService } from './clans.service';

type AuthRequest = Request & { user?: { id?: number } };

// Clanes = PRO/CHEF: JwtAuthGuard (auth) + PaidGuard (plan).
// ThrottlerGuard (120/min por IP, ver app.module); crear clan y mensajes llevan
// @Throttle propio porque pasan por moderación (OpenAI) y/o Storage.
@Controller('clans')
@UseGuards(JwtAuthGuard, PaidGuard, ThrottlerGuard)
export class ClansController {
  constructor(private readonly clansService: ClansService) {}

  @Get()
  browse(@Query('search') search: string, @Req() req: AuthRequest) {
    return this.clansService.browse(this.uid(req), search);
  }

  @Get('mine')
  getMine(@Req() req: AuthRequest) {
    return this.clansService.getMine(this.uid(req));
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } }) // crear clan modera nombre/desc con OpenAI
  @Post()
  create(
    @Body() body: { nombre: string; descripcion?: string; tipoAcceso?: string; especializacion?: string | null; avatarUrl?: string | null },
    @Req() req: AuthRequest,
  ) {
    return this.clansService.create(this.uid(req), body);
  }

  @Post('requests/:requestId/accept')
  acceptRequest(@Param('requestId') requestId: string, @Req() req: AuthRequest) {
    return this.clansService.acceptRequest(this.uid(req), requestId);
  }

  @Post('requests/:requestId/reject')
  rejectRequest(@Param('requestId') requestId: string, @Req() req: AuthRequest) {
    return this.clansService.rejectRequest(this.uid(req), requestId);
  }

  @Get(':id')
  getDetail(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.clansService.getDetail(this.uid(req), id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { descripcion?: string; tipoAcceso?: string; especializacion?: string | null; avatarUrl?: string | null },
    @Req() req: AuthRequest,
  ) {
    return this.clansService.update(this.uid(req), id, body);
  }

  @Get(':id/missions')
  getMissions(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.clansService.getMissions(this.uid(req), id);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.clansService.getMessages(this.uid(req), id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } }) // moderación + posible subida a Storage
  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() body: { contenido?: string; imagenUrl?: string | null; replyToId?: string | null },
    @Req() req: AuthRequest,
  ) {
    return this.clansService.sendMessage(this.uid(req), id, body.contenido ?? '', {
      imagenUrl: body.imagenUrl,
      replyToId: body.replyToId,
    });
  }

  @Post(':id/messages/:messageId/react')
  react(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
    @Req() req: AuthRequest,
  ) {
    return this.clansService.toggleReaction(this.uid(req), id, messageId, body.emoji);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.clansService.join(this.uid(req), id);
  }

  @Post(':id/leave')
  leave(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.clansService.leave(this.uid(req), id);
  }

  @Post(':id/members/:userId/promote')
  promote(@Param('id') id: string, @Param('userId') userId: string, @Req() req: AuthRequest) {
    return this.clansService.setRole(this.uid(req), id, parseInt(userId), 'co_lider');
  }

  @Post(':id/members/:userId/demote')
  demote(@Param('id') id: string, @Param('userId') userId: string, @Req() req: AuthRequest) {
    return this.clansService.setRole(this.uid(req), id, parseInt(userId), 'miembro');
  }

  @Post(':id/members/:userId/kick')
  kick(@Param('id') id: string, @Param('userId') userId: string, @Req() req: AuthRequest) {
    return this.clansService.kick(this.uid(req), id, parseInt(userId));
  }

  private uid(req: AuthRequest): number {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return req.user.id;
  }
}
