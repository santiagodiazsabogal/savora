import {
  Controller, Post, Get, Delete,
  Body, Param, Query, Req, UseGuards,
  UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Red social: disponible para los 3 planes. NO usa JwtAuthGuard de plan (sin gating)
// ni consume el límite FREE — solo requiere estar autenticado.
// ThrottlerGuard (120/min por IP); publicar/reportar llevan @Throttle más estricto
// (createPost sube a Storage + modera con OpenAI).
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('social')
export class SocialController {
  constructor(private socialService: SocialService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('posts')
  async createPost(
    @Body('type') type: string,
    @Body('imageBase64') imageBase64: string,
    @Body('caption') caption: string,
    @Body('recipeId') recipeId: number | null,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    if (!imageBase64?.trim()) throw new BadRequestException('Image is required');
    return this.socialService.createPost(req.user.id, {
      type, imageBase64, caption: caption ?? null, recipeId: recipeId ?? null,
    });
  }

  @Get('feed')
  async getFeed(
    @Query('cursor') cursor: string,
    @Query('type') type: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.getFeed(req.user.id, cursor || undefined, type || undefined);
  }

  @Get('top')
  async getTop(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.getTop(req.user.id);
  }

  @Post('posts/:id/like')
  async toggleLike(
    @Param('id') id: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.toggleLike(req.user.id, id);
  }

  @Delete('posts/:id')
  async deletePost(
    @Param('id') id: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.deletePost(req.user.id, id);
  }

  // 🔖 Guardar la receta de un post compartido como copia propia
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('posts/:id/save-recipe')
  async saveRecipe(
    @Param('id') id: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.saveRecipeFromPost(req.user.id, id);
  }

  // 🚩 Reportar una publicación
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('posts/:id/report')
  async reportPost(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.reportPost(req.user.id, id, reason);
  }

  // 🚩 Reportar un usuario
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('users/:userId/report')
  async reportUser(
    @Param('userId') userId: string,
    @Body('reason') reason: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.reportUser(req.user.id, Number(userId), reason);
  }

  // 🚫 Bloquear / desbloquear un usuario
  @Post('users/:userId/block')
  async blockUser(
    @Param('userId') userId: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.blockUser(req.user.id, Number(userId));
  }

  @Delete('users/:userId/block')
  async unblockUser(
    @Param('userId') userId: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.unblockUser(req.user.id, Number(userId));
  }

  // 📃 Usuarios que yo bloqueé
  @Get('blocked')
  async getBlocked(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.socialService.getBlocked(req.user.id);
  }
}
