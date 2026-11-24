import { ClansService } from './clans.service';

// Spec de la carrera de misiones de clan: el progreso avanza con increment ATÓMICO y
// el cierre usa updateMany({ completada:false, progresoActual >= meta }) → de N llamadas
// concurrentes solo UNA reparte el premio (antes el read-modify-write duplicaba el XP).
function makePrisma() {
  return {
    clanMember: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    clanMission: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    clan: { update: jest.fn().mockResolvedValue({}) },
    clanMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', reacciones: [] }) },
  };
}

const gatewayMock = { emitToClan: jest.fn() };
const openaiMock = { moderateText: jest.fn(), moderateImage: jest.fn() };
const statsMock = { awardXp: jest.fn().mockResolvedValue({}) };
const storageMock = { uploadClanChatImage: jest.fn(), deleteImage: jest.fn() };

const mision = (overrides: any = {}) => ({
  id: 'M1',
  progresoActual: 0,
  completada: false,
  xpRecompensaPorMiembro: 100,
  titulo: 'Calentando motores',
  condicion: { tipo: 'completar_leccion', meta: 8, key: 'calentando' },
  ...overrides,
});

describe('ClansService — trackMissionProgress (cierre atómico)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ClansService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new ClansService(
      prisma as any, gatewayMock as any, openaiMock as any, statsMock as any, storageMock as any,
    );
    prisma.clanMember.findFirst.mockResolvedValue({ clanId: 'C1' });
  });

  it('incrementa el progreso de forma atómica (increment, no valor calculado en JS)', async () => {
    prisma.clanMission.findMany.mockResolvedValue([mision({ progresoActual: 3 })]);
    prisma.clanMission.updateMany.mockResolvedValue({ count: 0 }); // no llega a la meta

    await service.trackMissionProgress(1, 'completar_leccion');

    expect(prisma.clanMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'M1', completada: false }),
        data: { progresoActual: { increment: 1 } },
      }),
    );
    // Sin cierre (count 0) → no hay premio
    expect(statsMock.awardXp).not.toHaveBeenCalled();
    expect(prisma.clan.update).not.toHaveBeenCalled();
  });

  it('cuando el cierre gana (count=1) reparte el premio UNA vez', async () => {
    prisma.clanMission.findMany.mockResolvedValue([mision({ progresoActual: 7 })]);
    prisma.clanMission.updateMany
      .mockResolvedValueOnce({ count: 1 }) // increment
      .mockResolvedValueOnce({ count: 1 }); // cierre → ganó
    prisma.clanMember.findMany.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await service.trackMissionProgress(1, 'completar_leccion');

    // XP a cada miembro + XP colectivo del clan, una sola vez
    expect(statsMock.awardXp).toHaveBeenCalledTimes(2);
    expect(prisma.clan.update).toHaveBeenCalledTimes(1);
  });

  it('cuando el cierre PIERDE la carrera (count=0) NO duplica el premio', async () => {
    prisma.clanMission.findMany.mockResolvedValue([mision({ progresoActual: 7 })]);
    prisma.clanMission.updateMany
      .mockResolvedValueOnce({ count: 1 }) // increment
      .mockResolvedValueOnce({ count: 0 }); // otra llamada concurrente ya la cerró

    await service.trackMissionProgress(1, 'completar_leccion');

    expect(statsMock.awardXp).not.toHaveBeenCalled();
    expect(prisma.clan.update).not.toHaveBeenCalled();
  });

  it('ignora misiones de otro tipo', async () => {
    prisma.clanMission.findMany.mockResolvedValue([
      mision({ condicion: { tipo: 'completar_curso', meta: 1, key: 'primer_plato' } }),
    ]);

    await service.trackMissionProgress(1, 'completar_leccion');

    expect(prisma.clanMission.updateMany).not.toHaveBeenCalled();
  });
});
