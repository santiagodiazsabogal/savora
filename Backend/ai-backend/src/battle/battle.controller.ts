import { Controller, Get, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BattleService } from './battle.service';

// ThrottlerGuard (120/min por IP): el catálogo se sirve cacheado, pero el primer
// request del día puede disparar la generación con OpenAI.
@Controller('battle')
@UseGuards(ThrottlerGuard)
export class BattleController {
  constructor(private battleService: BattleService) {}

  // Catálogo de recetas para el modo "Receta del chef".
  // El usuario ve los ingredientes y elige en cuál competir.
  @UseGuards(JwtAuthGuard)
  @Get('recipe-options')
  async getRecipeOptions(
    @Query('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    const options = await this.battleService.getRecipeOptions(language === 'en' ? 'en' : 'es');
    return { options };
  }
}
