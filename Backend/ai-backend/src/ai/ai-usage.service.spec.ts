import { HttpException } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';

// Tope diario de IA compartido (User.aiUsageDate/aiUsageCount): FREE 25 / PRO 40 / CHEF 100.
// Mismo patrón que el resto de specs: new Service(mockPrisma), sin DB ni DI de Nest.
function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const hoy = () => new Date();

describe('AiUsageService — tope diario de IA', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AiUsageService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AiUsageService(prisma as any);
  });

  it('FREE en el cap (25 hoy) → 429 DAILY_LIMIT_REACHED', async () => {
    const user = { id: 1, plan: 'FREE', aiUsageDate: hoy(), aiUsageCount: 25 };
    await expect(service.assertDailyAiLimit(user)).rejects.toMatchObject({
      status: 429,
    });
    await expect(service.assertDailyAiLimit(user)).rejects.toBeInstanceOf(HttpException);
  });

  it('FREE por debajo del cap pasa y devuelve el user para el bump', async () => {
    const user = { id: 1, plan: 'FREE', aiUsageDate: hoy(), aiUsageCount: 24 };
    await expect(service.assertDailyAiLimit(user)).resolves.toBe(user);
  });

  it('PRO topa a 40 y CHEF a 100', async () => {
    await expect(
      service.assertDailyAiLimit({ id: 1, plan: 'PRO', aiUsageDate: hoy(), aiUsageCount: 40 }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      service.assertDailyAiLimit({ id: 1, plan: 'CHEF', aiUsageDate: hoy(), aiUsageCount: 99 }),
    ).resolves.toBeTruthy();
    await expect(
      service.assertDailyAiLimit({ id: 1, plan: 'CHEF', aiUsageDate: hoy(), aiUsageCount: 100 }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('el contador de AYER no cuenta (reset por día UTC)', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await expect(
      service.assertDailyAiLimit({ id: 1, plan: 'FREE', aiUsageDate: ayer, aiUsageCount: 999 }),
    ).resolves.toBeTruthy();
  });

  it('acepta userId y carga el user de la DB', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7, plan: 'FREE', aiUsageDate: hoy(), aiUsageCount: 25 });
    await expect(service.assertDailyAiLimit(7)).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
  });

  it('bump suma 1 sobre el uso de hoy y resetea si cambió el día', async () => {
    await service.bumpDailyAiUsage({ id: 1, plan: 'FREE', aiUsageDate: hoy(), aiUsageCount: 3 });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aiUsageCount: 4 }) }),
    );

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await service.bumpDailyAiUsage({ id: 1, plan: 'FREE', aiUsageDate: ayer, aiUsageCount: 30 });
    expect(prisma.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aiUsageCount: 1 }) }),
    );
  });
});
