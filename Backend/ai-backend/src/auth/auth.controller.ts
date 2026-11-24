import { Controller, Post, Body, Get, Query, UseGuards, Req, Res } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/DTO/create-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

// Rate limiting estricto en auth (anti fuerza bruta / spam de correos). Límites por IP/min.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {

  constructor(private readonly authService: AuthService) {}

  // 📝 Registro de usuario
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  // ✅ Verificación de email → redirige al frontend (no devuelve JSON crudo)
  @Get('verify')
  async verify(@Query('token') token: string, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      await this.authService.verifyEmail(token);
      return res.redirect(`${frontendUrl}/login?verified=1`);
    } catch {
      return res.redirect(`${frontendUrl}/login?verified=0`);
    }
  }

  // 🔐 Login
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() body: { email: string; password: string }
  ) {
    const { email, password } = body;

    return this.authService.login(email, password);
  }

  // 🔑 Olvidé mi contraseña → envía email con enlace de reset (respuesta genérica)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  // 🔑 Restablecer contraseña con el token del email
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.resetPassword(token, password);
  }

  // 🔄 Renovar el access token con el refresh token (rotación: el refresh se cambia por uno nuevo)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  // 🚪 Logout: revoca el refresh token (corta la sesión server-side)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  async logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }

  // 🔐 Endpoint protegido para probar JWT
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: any) {
    return req.user;
  }

}