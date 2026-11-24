import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { MarketService } from './market.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddMarketItemDto, GenerateMarketDto, UpdateMarketItemDto } from './dto/market.dto';

// Mercado (grocery list) — PRO/CHEF (el gate de plan lo aplica el service → 403 PRO_ONLY).
// ThrottlerGuard 120/min por IP por defecto; generate/estimate llevan @Throttle propio
// porque llaman a OpenAI (estimación de precios).
@Controller('market')
@UseGuards(ThrottlerGuard)
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  private uid(req: Request & { user?: { id?: number } }): number {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return req.user.id;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getItems(@Req() req: Request & { user?: any }) {
    return this.marketService.getItems(this.uid(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('items')
  async addItem(@Req() req: Request & { user?: any }, @Body() dto: AddMarketItemDto) {
    return this.marketService.addItem(this.uid(req), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('items/:id')
  async updateItem(
    @Req() req: Request & { user?: any },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMarketItemDto,
  ) {
    return this.marketService.updateItem(this.uid(req), id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('checked')
  async clearChecked(@Req() req: Request & { user?: any }) {
    return this.marketService.clearChecked(this.uid(req));
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:id')
  async deleteItem(
    @Req() req: Request & { user?: any },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.marketService.deleteItem(this.uid(req), id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generate(@Req() req: Request & { user?: any }, @Body() dto: GenerateMarketDto) {
    return this.marketService.generateMarket(this.uid(req), dto.items ?? []);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('estimate')
  async estimate(@Req() req: Request & { user?: any }) {
    return this.marketService.estimatePrices(this.uid(req));
  }
}
