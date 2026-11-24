import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../auth/email.service';

// 📋 Waitlist de pre-lanzamiento — pública (sin auth). La POSICIÓN no se guarda:
// ranking = ORDER BY referralCount DESC, createdAt ASC (traer referidos te sube).
// El anti-spam vive en el controller (throttle 3/h por IP) + aquí (dominios desechables).

// Alfabeto sin 0/O/1/I para que el código sea legible al compartirlo en voz alta.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

// Lista corta de dominios de email desechables (suficiente para v1; ampliar si hace falta).
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.net',
  'tempmail.com', 'temp-mail.org', 'yopmail.com', 'sharklasers.com', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'mintemail.com',
  'throwawaymail.com', 'mytemp.email', 'tempinbox.com', 'mohmal.com', 'emailondeck.com',
]);

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // Código de referido único: crypto (mismo criterio que resetToken — nanoid no está
  // en deps y su v4+ es ESM-only, rompe el build CommonJS de Nest).
  private generateCode(): string {
    const bytes = randomBytes(CODE_LEN);
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return code;
  }

  // Posición efectiva = 1 + cuántos están "por delante": más referidos, o mismos
  // referidos pero registrados antes. No se persiste → nunca se desincroniza.
  private async positionOf(entry: { referralCount: number; createdAt: Date }): Promise<number> {
    const ahead = await this.prisma.waitlistEntry.count({
      where: {
        OR: [
          { referralCount: { gt: entry.referralCount } },
          { referralCount: entry.referralCount, createdAt: { lt: entry.createdAt } },
        ],
      },
    });
    return ahead + 1;
  }

  async join(emailRaw: string, referredByCode?: string) {
    const email = emailRaw.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (DISPOSABLE_DOMAINS.has(domain)) throw new BadRequestException('DISPOSABLE_EMAIL');

    // Ya registrado → 409 con su posición actual (mejor UX que un error genérico).
    const existing = await this.prisma.waitlistEntry.findUnique({ where: { email } });
    if (existing) {
      const [position, totalSignups] = await Promise.all([
        this.positionOf(existing),
        this.prisma.waitlistEntry.count(),
      ]);
      throw new ConflictException({
        message: 'ALREADY_REGISTERED',
        position,
        referralCode: existing.referralCode,
        referralCount: existing.referralCount,
        totalSignups,
      });
    }

    // Referente válido (código inválido → se ignora en silencio, no bloquea el registro).
    const cleanRef = referredByCode?.trim().toUpperCase() || null;
    const referrer = cleanRef
      ? await this.prisma.waitlistEntry.findUnique({ where: { referralCode: cleanRef } })
      : null;

    // Crear con código único (reintenta ante la remota colisión de 8 chars).
    let entry: { id: string; referralCode: string; referralCount: number; createdAt: Date } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        entry = await this.prisma.waitlistEntry.create({
          data: { email, referralCode: this.generateCode(), referredBy: referrer?.referralCode ?? null },
        });
        break;
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
        // P2002 en email = carrera de doble submit → tratar como ya registrado.
        const raced = await this.prisma.waitlistEntry.findUnique({ where: { email } });
        if (raced) return this.join(email); // reentra → cae en el 409 con su posición
        // si no fue el email, chocó el código → reintentar con otro
      }
    }
    if (!entry) throw new BadRequestException('Could not generate referral code, try again');

    if (referrer) {
      await this.prisma.waitlistEntry.update({
        where: { id: referrer.id },
        data: { referralCount: { increment: 1 } },
      });
    }

    const [position, totalSignups] = await Promise.all([
      this.positionOf(entry),
      this.prisma.waitlistEntry.count(),
    ]);

    // Email 1 (confirmación + posición + link de referido) — fire-and-forget: un fallo
    // de Resend no debe romper el registro.
    this.email
      .sendWaitlistWelcomeEmail(email, entry.referralCode, position)
      .catch((e) => this.logger.warn(`Email waitlist a ${email} falló: ${e?.message ?? e}`));

    return { position, referralCode: entry.referralCode, totalSignups };
  }

  // Estado por código (la página de "gracias" lo refresca al volver).
  async status(referralCode: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { referralCode: (referralCode ?? '').trim().toUpperCase() },
    });
    if (!entry) throw new NotFoundException('CODE_NOT_FOUND');
    const [position, totalSignups] = await Promise.all([
      this.positionOf(entry),
      this.prisma.waitlistEntry.count(),
    ]);
    return { position, referralCount: entry.referralCount, totalSignups };
  }

  // Dashboard interno (solo admins): totales, registros por día (14d) y top referentes.
  async stats() {
    const [totalSignups, topReferrers, byDay] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.findMany({
        where: { referralCount: { gt: 0 } },
        orderBy: [{ referralCount: 'desc' }, { createdAt: 'asc' }],
        take: 10,
        select: { email: true, referralCode: true, referralCount: true, createdAt: true },
      }),
      this.prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM "WaitlistEntry"
        WHERE "createdAt" >= NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1`,
    ]);
    return { totalSignups, byDay, topReferrers };
  }
}
