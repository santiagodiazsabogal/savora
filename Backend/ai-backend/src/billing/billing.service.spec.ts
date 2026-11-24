import { UnauthorizedException } from '@nestjs/common';
import { BillingService } from './billing.service';

// Tests unitarios del webhook de billing (RevenueCat). Lógica pura + prisma mockeado:
// asigna el PLAN del usuario, así que es seguridad-crítico (un fallo = plan regalado o robado).
describe('BillingService', () => {
  let prisma: any;
  let service: BillingService;
  const SECRET = 'test-webhook-secret';

  beforeEach(() => {
    prisma = {
      user: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
    };
    service = new BillingService(prisma);
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    delete process.env.RC_ENTITLEMENT_PRO;
    delete process.env.RC_ENTITLEMENT_CHEF;
    delete process.env.REVENUECAT_API_KEY;
  });

  afterEach(() => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  describe('planFromEntitlements', () => {
    it('chef gana sobre pro', () => {
      expect(service.planFromEntitlements(['pro', 'chef'])).toBe('CHEF');
    });
    it('pro cuando no hay chef', () => {
      expect(service.planFromEntitlements(['pro'])).toBe('PRO');
    });
    it('FREE cuando está vacío, es desconocido, null o undefined', () => {
      expect(service.planFromEntitlements([])).toBe('FREE');
      expect(service.planFromEntitlements(['otra_cosa'])).toBe('FREE');
      expect(service.planFromEntitlements(null)).toBe('FREE');
      expect(service.planFromEntitlements(undefined)).toBe('FREE');
    });
    it('respeta entitlements custom por env', () => {
      process.env.RC_ENTITLEMENT_PRO = 'premium';
      process.env.RC_ENTITLEMENT_CHEF = 'master';
      expect(service.planFromEntitlements(['master'])).toBe('CHEF');
      expect(service.planFromEntitlements(['premium'])).toBe('PRO');
      expect(service.planFromEntitlements(['pro'])).toBe('FREE'); // ya no aplica el default
    });
  });

  describe('handleWebhook — verificación del secreto (fail-closed)', () => {
    it('401 sin header Authorization y NO toca la DB', async () => {
      await expect(service.handleWebhook(undefined, { event: {} })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
    it('401 con header incorrecto', async () => {
      await expect(service.handleWebhook('mal-secreto', { event: {} })).rejects.toBeInstanceOf(UnauthorizedException);
    });
    it('401 si el env del secreto no está configurado', async () => {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
      await expect(service.handleWebhook(SECRET, { event: {} })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('handleWebhook — mapeo de eventos', () => {
    const ev = (over: any) => ({ event: { app_user_id: '42', ...over } });

    it('INITIAL_PURCHASE chef → plan CHEF + planExpiresAt', async () => {
      const exp = 1893456000000;
      const r = await service.handleWebhook(SECRET, ev({ type: 'INITIAL_PURCHASE', entitlement_ids: ['chef'], expiration_at_ms: exp }));
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { plan: 'CHEF', planExpiresAt: new Date(exp) } });
      expect(r).toEqual({ received: true });
    });

    it('RENEWAL pro → plan PRO', async () => {
      await service.handleWebhook(SECRET, ev({ type: 'RENEWAL', entitlement_ids: ['pro'], expiration_at_ms: 1700000000000 }));
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { plan: 'PRO', planExpiresAt: new Date(1700000000000) } });
    });

    it('EXPIRATION → FREE + planExpiresAt null', async () => {
      await service.handleWebhook(SECRET, ev({ type: 'EXPIRATION' }));
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { plan: 'FREE', planExpiresAt: null } });
    });

    it('CANCELLATION → ignorado, sin cambio de plan', async () => {
      const r = await service.handleWebhook(SECRET, ev({ type: 'CANCELLATION' }));
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(r).toEqual({ received: true, ignored: true });
    });

    it('app_user_id anónimo ($RCAnonymousID) → ignorado sin tocar la DB', async () => {
      const r = await service.handleWebhook(SECRET, { event: { type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc', entitlement_ids: ['chef'] } });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(r).toEqual({ received: true, ignored: true });
    });

    it('usuario inexistente (update falla) → responde 200 igual (RC no reintenta)', async () => {
      prisma.user.update.mockRejectedValueOnce(new Error('record not found'));
      const r = await service.handleWebhook(SECRET, ev({ type: 'RENEWAL', entitlement_ids: ['pro'], expiration_at_ms: 123 }));
      expect(r).toEqual({ received: true });
    });
  });

  describe('syncUser sin API key', () => {
    it('devuelve el plan actual sin tocar nada', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'PRO', planExpiresAt: null });
      const r = await service.syncUser(42);
      expect(r).toEqual({ plan: 'PRO', planExpiresAt: null, synced: false });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('downgradeExpired (cron de seguridad)', () => {
    it('baja a FREE los planes caducados', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 3 });
      const r = await service.downgradeExpired();
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { planExpiresAt: { lt: expect.any(Date) }, plan: { not: 'FREE' } },
        data: { plan: 'FREE', planExpiresAt: null },
      });
      expect(r.count).toBe(3);
    });
  });
});
