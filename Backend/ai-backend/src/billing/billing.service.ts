import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

type Plan = 'FREE' | 'PRO' | 'CHEF';

// Tipos de evento de RevenueCat. Otorgan/revocan acceso; el resto no cambia el plan.
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED', 'NON_RENEWING_PURCHASE',
]);
const REVOKE_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private prisma: PrismaService) {}

  private get entPro() { return process.env.RC_ENTITLEMENT_PRO || 'pro'; }
  private get entChef() { return process.env.RC_ENTITLEMENT_CHEF || 'chef'; }

  // chef gana sobre pro; sin entitlement reconocido → FREE.
  planFromEntitlements(ids: string[] | undefined | null): Plan {
    const set = new Set((ids ?? []).map((s) => String(s)));
    if (set.has(this.entChef)) return 'CHEF';
    if (set.has(this.entPro)) return 'PRO';
    return 'FREE';
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  // Webhook server-to-server de RevenueCat. Verifica el secreto del header Authorization
  // (fail-closed: si el env no está o no coincide → 401). El plan SOLO cambia por aquí o por sync.
  async handleWebhook(authHeader: string | undefined, body: any) {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret || !authHeader || !this.timingSafeEqual(authHeader, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = body?.event ?? {};
    const type: string = event.type ?? '';
    const appUserId = String(event.app_user_id ?? '');
    const userId = Number(appUserId);

    // El app debe hacer Purchases.logIn(userId). Un id anónimo ($RCAnonymousID:...) se ignora.
    if (!appUserId || !Number.isInteger(userId) || userId <= 0) {
      this.logger.warn(`Webhook ${type}: app_user_id no numérico (${appUserId}) — ignorado`);
      return { received: true, ignored: true };
    }

    let data: { plan: Plan; planExpiresAt: Date | null } | null = null;
    if (GRANT_EVENTS.has(type)) {
      const plan = this.planFromEntitlements(event.entitlement_ids);
      const exp = event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)) : null;
      data = { plan, planExpiresAt: exp };
    } else if (REVOKE_EVENTS.has(type)) {
      data = { plan: 'FREE', planExpiresAt: null };
    } else {
      this.logger.log(`Webhook ${type} (user ${userId}) — sin cambio de plan`);
      return { received: true, ignored: true };
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data: data as any });
      this.logger.log(`Webhook ${type}: user ${userId} → plan ${data.plan}`);
    } catch (e: any) {
      // Usuario inexistente u otro error → 200 igual, para que RevenueCat no reintente sin fin.
      this.logger.warn(`Webhook ${type}: no se pudo actualizar user ${userId}: ${e?.message}`);
    }
    return { received: true };
  }

  // Sincroniza el plan consultando a RevenueCat (autoridad server-side). Lo llama el app tras comprar.
  async syncUser(userId: number) {
    const apiKey = process.env.REVENUECAT_API_KEY;
    if (!apiKey) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId }, select: { plan: true, planExpiresAt: true },
      });
      return { plan: u?.plan ?? 'FREE', planExpiresAt: u?.planExpiresAt ?? null, synced: false };
    }

    try {
      const res = await (globalThis as any).fetch(`https://api.revenuecat.com/v1/subscribers/${userId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`RC ${res.status}`);
      const json: any = await res.json();
      const ents = json?.subscriber?.entitlements ?? {};
      const now = Date.now();
      const active: string[] = [];
      let maxExp: number | null = null;
      for (const [id, ent] of Object.entries<any>(ents)) {
        const exp = ent?.expires_date ? Date.parse(ent.expires_date) : null;
        if (exp === null || exp > now) {
          active.push(id);
          if (exp !== null) maxExp = Math.max(maxExp ?? 0, exp);
        }
      }
      const plan = this.planFromEntitlements(active);
      const planExpiresAt = maxExp ? new Date(maxExp) : null;
      await this.prisma.user.update({ where: { id: userId }, data: { plan, planExpiresAt } as any });
      return { plan, planExpiresAt, synced: true };
    } catch (e: any) {
      this.logger.warn(`sync user ${userId} falló: ${e?.message}`);
      const u = await this.prisma.user.findUnique({
        where: { id: userId }, select: { plan: true, planExpiresAt: true },
      });
      return { plan: u?.plan ?? 'FREE', planExpiresAt: u?.planExpiresAt ?? null, synced: false };
    }
  }

  // Red de seguridad (03:00 diario): baja a FREE los planes caducados por si se perdió un webhook.
  @Cron('0 3 * * *')
  async downgradeExpired() {
    const res = await this.prisma.user.updateMany({
      where: { planExpiresAt: { lt: new Date() }, plan: { not: 'FREE' } },
      data: { plan: 'FREE', planExpiresAt: null },
    });
    if (res.count > 0) this.logger.log(`Cron billing: ${res.count} plan(es) caducado(s) → FREE`);
    return res;
  }
}
