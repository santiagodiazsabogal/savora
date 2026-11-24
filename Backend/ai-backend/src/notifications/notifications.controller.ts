import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('token')
  registerToken(
    @Body('token') token: string,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated')
    if (!token?.trim()) throw new BadRequestException('Token is required')
    return this.notificationsService.registerToken(req.user.id, token.trim())
  }

  @Delete('token')
  removeToken(@Req() req: Request & { user?: { id?: number } }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated')
    return this.notificationsService.removeToken(req.user.id)
  }
}
