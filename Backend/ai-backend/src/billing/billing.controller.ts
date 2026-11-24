import {
  Controller, Post, Headers, Body, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Webhook de RevenueCat — PÚBLICO (autenticado por el header Authorization compartido).
  // Body 'any' a propósito: el ValidationPipe global no recorta cuerpos sin DTO.
  @Post('webhook')
  webhook(@Headers('authorization') auth: string, @Body() body: any) {
    return this.billing.handleWebhook(auth, body);
  }

  // El app lo llama tras una compra para reflejar el plan al instante (sin esperar al webhook).
  @UseGuards(JwtAuthGuard)
  @Post('sync')
  sync(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.billing.syncUser(req.user.id);
  }
}
