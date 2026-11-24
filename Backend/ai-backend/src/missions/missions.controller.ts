import { Controller, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MissionsService } from './missions.service';

@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get('today')
  getTodayMissions(@Req() req: Request & { user?: { id?: number } }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.missionsService.getTodayMissions(req.user.id);
  }
}
