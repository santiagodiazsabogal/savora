import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/waitlist.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

// Waitlist pública (sin JwtAuthGuard salvo /stats). ThrottlerGuard en todo el
// controller; el POST lleva su límite propio anti-spam: 3 registros/hora por IP.
@Controller('waitlist')
@UseGuards(ThrottlerGuard)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post()
  async join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto.email, dto.referredByCode);
  }

  // ⚠️ Declarado ANTES de ':referralCode' para que 'stats' no matchee como código.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('stats')
  async stats() {
    return this.waitlist.stats();
  }

  @Get(':referralCode')
  async status(@Param('referralCode') referralCode: string) {
    return this.waitlist.status(referralCode);
  }
}
