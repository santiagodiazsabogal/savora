import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/DTO/create-user.dto';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  // Access token corto (revocación rápida) + refresh largo (continuidad). Configurables por env.
  private readonly ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '1d';
  private readonly REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);

  constructor(
    private usersService: UsersService,
    private emailService: EmailService,
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // =========================
  // TOKENS (access + refresh)
  // =========================
  // El refresh token en claro NUNCA se guarda: solo su sha256. Se devuelve en claro UNA vez.
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async issueTokens(user: { id: number; email: string }) {
    const access_token = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: this.ACCESS_TTL as any },
    );
    const raw = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + this.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.hashToken(raw), expiresAt },
    });
    return { access_token, refresh_token: raw };
  }

  // Intercambia un refresh token válido por un par nuevo (ROTACIÓN: el usado se revoca →
  // refresh de un solo uso, reuso = rechazo). Revalida que la cuenta no esté borrada/baneada.
  async refresh(rawToken: string) {
    const clean = (rawToken || '').trim();
    if (!clean) throw new UnauthorizedException('INVALID_REFRESH_TOKEN');

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(clean) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }
    const user = record.user;
    if (!user || user.deletedAt || user.bannedAt) {
      await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('ACCOUNT_SUSPENDED');
    }
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user);
  }

  // Logout: revoca el refresh token (el access token muere solo al caducar, ≤ ACCESS_TTL).
  async logout(rawToken: string) {
    const clean = (rawToken || '').trim();
    if (clean) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(clean), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  // Limpieza diaria de refresh tokens caducados/revocados viejos (evita que la tabla crezca).
  @Cron('30 3 * * *')
  async purgeOldRefreshTokens() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
      });
    } catch { /* best-effort */ }
  }

  // =========================
  // REGISTER
  // =========================
  async register(createUserDto: CreateUserDto) {
    // Aceptación de Términos + Privacidad exigida SERVER-SIDE (requisito UGC de Apple):
    // el checkbox del cliente no basta — sin acceptTerms=true no se crea la cuenta.
    if (createUserDto.acceptTerms !== true) {
      throw new BadRequestException('TERMS_NOT_ACCEPTED');
    }

    const user = await this.usersService.createUser(
      createUserDto.email,
      createUserDto.password,
      createUserDto.name,
    );

    if (!user.verificationToken) {
      throw new Error('Could not generate the verification token');
    }

    await this.emailService.sendVerificationEmail(
      user.email,
      user.verificationToken,
    );

    return {
      message: 'Account created. Check your email to verify your account.',
    };
  }

  // =========================
  // VERIFY EMAIL
  // =========================
  async verifyEmail(token: string) {
    // Sin esta validación, un token undefined haría que Prisma ignore el filtro
    // (where: { verificationToken: undefined } = sin filtro) y verificaría al
    // primer usuario de la tabla.
    const cleanToken = (token ?? '').trim();
    if (!cleanToken) {
      throw new BadRequestException('The verification link is invalid or has expired');
    }

    const user = await this.prisma.user.findFirst({
      where: { verificationToken: cleanToken },
    });

    if (!user) {
      throw new BadRequestException('The verification link is invalid or has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // =========================
  // LOGIN + JWT
  // =========================
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.deletedAt) {
      // Non-existent or deleted account → same generic message (don't reveal).
      throw new UnauthorizedException('Incorrect email or password');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('You must verify your email before logging in');
    }

    // Baneo: se comprueba DESPUÉS de validar la contraseña para no revelar a terceros
    // que una cuenta existe y está suspendida.
    if (user.bannedAt) {
      throw new UnauthorizedException('ACCOUNT_SUSPENDED');
    }

    // Access token corto + refresh token (rotable/revocable).
    return this.issueTokens(user);
  }

  // =========================
  // FORGOT PASSWORD
  // Genera un token de un solo uso (1h) y manda el email. SIEMPRE devuelve el
  // mismo mensaje genérico para no revelar si un email existe (anti-enumeración).
  // =========================
  async forgotPassword(email: string) {
    const generic = {
      message: 'If the email is registered, we sent you a link to reset your password.',
    };
    const clean = (email ?? '').trim().toLowerCase();
    if (!clean) return generic;

    const user = await this.prisma.user.findUnique({ where: { email: clean } });
    if (!user) return generic;

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    try {
      await this.emailService.sendPasswordResetEmail(user.email, token);
    } catch {
      // No exponemos fallos de email al cliente (seguimos devolviendo el genérico).
    }

    return generic;
  }

  // =========================
  // RESET PASSWORD
  // Valida el token (existe y no caducó), cambia la contraseña y lo invalida.
  // =========================
  async resetPassword(token: string, newPassword: string) {
    const cleanToken = (token ?? '').trim();
    if (!cleanToken) throw new BadRequestException('Token required');
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('The password must be at least 6 characters long');
    }

    const user = await this.prisma.user.findFirst({
      where: { resetToken: cleanToken },
    });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry.getTime() < Date.now()) {
      throw new BadRequestException('The link is invalid or has expired');
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        // Si el usuario reseteó la contraseña, su email queda verificado de facto
        // (recibió y abrió el correo) → no lo dejamos bloqueado en el login.
        isVerified: true,
      },
    });

    return { message: 'Password updated. You can now log in.' };
  }
}