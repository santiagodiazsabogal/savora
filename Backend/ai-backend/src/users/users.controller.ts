import {
  Controller,
  Put,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException
} from '@nestjs/common';

import { UsersService } from './users.service';
import { UpdateProfileDto } from './DTO/update-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {}

  private uid(req: any): number {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) throw new BadRequestException('UserId no encontrado en el token');
    return userId;
  }

  // =========================
  // 🔎 Obtener perfil usuario
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {

    const userId = req.user?.userId || req.user?.id || req.user?.sub;

    if (!userId) {
      throw new BadRequestException('UserId no encontrado en el token');
    }

    return this.usersService.findById(userId);

  }

  // =========================
  // 🥗 Actualizar perfil
  // =========================
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto
  ) {

    const userId = req.user?.userId || req.user?.id || req.user?.sub;

    if (!userId) {
      throw new BadRequestException('UserId no encontrado en el token');
    }

    return this.usersService.updateProfile(
      userId,
      updateProfileDto
    );

  }

  // =========================
  // 🔎 Disponibilidad de @username
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('username-available')
  async usernameAvailable(@Request() req, @Query('u') u: string) {
    return this.usersService.checkUsername(u, this.uid(req));
  }

  // =========================
  // 🔎 Buscar usuarios
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('search')
  async search(@Request() req, @Query('q') q: string) {
    return this.usersService.searchUsers(q, this.uid(req));
  }

  // =========================
  // 👤 Perfil público por username
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('u/:username')
  async publicProfile(@Request() req, @Param('username') username: string) {
    return this.usersService.getPublicProfile(username, this.uid(req));
  }

  // =========================
  // 🗑️ Eliminar cuenta (soft delete + anonimización). Pide contraseña actual.
  // =========================
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async deleteAccount(@Request() req, @Body('password') password: string) {
    return this.usersService.deleteAccount(this.uid(req), password);
  }

}