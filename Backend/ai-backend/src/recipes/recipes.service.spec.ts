import { HttpException } from '@nestjs/common';
import { RecipesService } from './recipes.service';

// Tests unitarios del tope de IA: límite FREE y cupo diario PRO/CHEF (regla de negocio crítica:
// protege la factura de OpenAI). Los métodos son privados → se invocan vía `as any`.
describe('RecipesService — límites de IA', () => {
  let prisma: any;
  let service: any;

  beforeEach(() => {
    prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    service = new RecipesService(prisma, {} as any, {} as any, {} as any);
  });

  const today = new Date();
  const user = (over: any = {}) => ({ id: 1, plan: 'PRO', aiUsageDate: null, aiUsageCount: 0, ...over });

  describe('dailyAiCap', () => {
    it('FREE → null (no aplica; ya topado por requestsUsed)', () => {
      expect(service.dailyAiCap('FREE')).toBeNull();
    });
    it('PRO → 40', () => {
      expect(service.dailyAiCap('PRO')).toBe(40);
    });
    it('CHEF → 100', () => {
      expect(service.dailyAiCap('CHEF')).toBe(100);
    });
  });

  describe('assertDailyAiLimit', () => {
    it('FREE nunca lanza, aunque el contador esté altísimo', () => {
      expect(() => service.assertDailyAiLimit(user({ plan: 'FREE', aiUsageCount: 9999, aiUsageDate: today }))).not.toThrow();
    });

    it('PRO bajo el cupo (39/40) → no lanza', () => {
      expect(() => service.assertDailyAiLimit(user({ plan: 'PRO', aiUsageCount: 39, aiUsageDate: today }))).not.toThrow();
    });

    it('PRO en el cupo (40/40) → 429 DAILY_LIMIT_REACHED', () => {
      let err: any;
      try { service.assertDailyAiLimit(user({ plan: 'PRO', aiUsageCount: 40, aiUsageDate: today })); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.message).toBe('DAILY_LIMIT_REACHED');
    });

    it('CHEF en el cupo (100/100) → 429', () => {
      expect(() => service.assertDailyAiLimit(user({ plan: 'CHEF', aiUsageCount: 100, aiUsageDate: today }))).toThrow(HttpException);
    });

    it('cupo de un día anterior → se ignora (reset por día UTC)', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(() => service.assertDailyAiLimit(user({ plan: 'PRO', aiUsageCount: 9999, aiUsageDate: yesterday }))).not.toThrow();
    });
  });

  describe('bumpDailyAiUsage', () => {
    it('FREE → no-op (no escribe en la DB)', async () => {
      await service.bumpDailyAiUsage(user({ plan: 'FREE' }));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('PRO → suma al cupo de hoy', async () => {
      await service.bumpDailyAiUsage(user({ plan: 'PRO', aiUsageCount: 5, aiUsageDate: today }));
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });
  });
});
