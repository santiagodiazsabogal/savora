import { Controller, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BadgesService } from './badges.service';

type AuthRequest = Request & { user?: { id?: number } };

// Insignias / logros — visible para los 3 planes (solo requiere auth).
@Controller('badges')
@UseGuards(JwtAuthGuard)
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  // Recalcula y devuelve TODAS las insignias del usuario (ganadas y pendientes).
  @Get()
  getAll(@Req() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return this.badgesService.getAllForUser(userId);
  }
}
