import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FriendsService } from './friends.service';

type AuthRequest = Request & { user?: { id?: number; sub?: number } };

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  private uid(req: AuthRequest): number {
    const id = req.user?.id ?? req.user?.sub;
    if (!id) throw new UnauthorizedException('Not authenticated');
    return id;
  }

  // Lista de amigos.
  @Get()
  list(@Req() req: AuthRequest) {
    return this.friendsService.listFriends(this.uid(req));
  }

  // Solicitudes entrantes pendientes.
  @Get('requests')
  requests(@Req() req: AuthRequest) {
    return this.friendsService.listRequests(this.uid(req));
  }

  // Contadores (badge de la pestaña).
  @Get('counts')
  counts(@Req() req: AuthRequest) {
    return this.friendsService.counts(this.uid(req));
  }

  // Enviar solicitud por username o userId.
  @Post('request')
  request(@Req() req: AuthRequest, @Body() body: { username?: string; userId?: number }) {
    const me = this.uid(req);
    if (body?.userId) return this.friendsService.sendRequest(me, Number(body.userId));
    if (body?.username) return this.friendsService.sendRequestByUsername(me, body.username);
    throw new BadRequestException('username o userId requerido');
  }

  @Post('requests/:id/accept')
  accept(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.friendsService.accept(this.uid(req), id);
  }

  @Post('requests/:id/reject')
  reject(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.friendsService.reject(this.uid(req), id);
  }

  // Quitar amistad / cancelar solicitud con otro usuario.
  @Delete(':userId')
  remove(@Req() req: AuthRequest, @Param('userId') userId: string) {
    return this.friendsService.remove(this.uid(req), Number(userId));
  }
}
