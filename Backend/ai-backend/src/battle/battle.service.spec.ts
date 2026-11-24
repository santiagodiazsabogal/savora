import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BattleService } from './battle.service';
import { SocketUser } from './battle.types';

// Mocks reutilizables de Prisma y OpenAI
function makePrismaMock() {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    cookBattle: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cookBattlePlayer: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    battleRecipeOption: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    recipe: { create: jest.fn() },
  };
}

function makeOpenaiMock() {
  return {
    generarReceta: jest.fn(),
    juzgarBatalla: jest.fn(),
  };
}

function makeStatsMock() {
  return {
    // awardBattleXp lee el resultado (xpTotal/nivel/leveledUp) para armar judgeData.xp
    awardXp: jest.fn().mockResolvedValue({ xpTotal: 100, nivel: 2, leveledUp: false }),
  };
}

function makeStorageMock() {
  return {
    uploadBattlePhoto: jest.fn().mockResolvedValue('https://storage/battles/x.jpg'),
    deleteImage: jest.fn().mockResolvedValue(undefined),
    deleteImages: jest.fn().mockResolvedValue(undefined),
  };
}

// Batalla mínima válida que devuelve buildState()
function minimalBattle(overrides: Partial<any> = {}) {
  return {
    id: 'B-NEW',
    mode: 'chef_choice',
    status: 'waiting',
    mealTime: null,
    language: 'es',
    lobbyExpiresAt: new Date(Date.now() + 120000),
    cookingEndsAt: null,
    timeLimitSec: null,
    winnerUserId: null,
    recipeData: null,
    judgeData: null,
    players: [
      { userId: 1, isReady: false, isHost: true, photoSubmitted: false, user: { name: 'Ana' } },
    ],
    ...overrides,
  };
}

const USER: SocketUser = { id: 1, email: 'ana@savora.app' };

describe('BattleService', () => {
  let service: BattleService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let openai: ReturnType<typeof makeOpenaiMock>;
  let stats: ReturnType<typeof makeStatsMock>;
  let storage: ReturnType<typeof makeStorageMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    openai = makeOpenaiMock();
    stats = makeStatsMock();
    storage = makeStorageMock();
    service = new BattleService(prisma as any, openai as any, stats as any, storage as any);
  });

  // =========================
  // Lógica pura
  // =========================
  describe('lógica pura', () => {
    const s = () => service as any;

    it('jaccard calcula el solapamiento correcto', () => {
      expect(s().jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
      expect(s().jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
      expect(s().jaccard([], ['a'])).toBe(0);
      expect(s().jaccard(['a'], [])).toBe(0);
    });

    it('computeSharedIngredients devuelve la intersección cuando es >= 3', () => {
      const players = [
        { ingredients: ['a', 'b', 'c', 'd'] },
        { ingredients: ['b', 'c', 'd', 'e'] },
      ];
      expect(s().computeSharedIngredients(players).sort()).toEqual(['b', 'c', 'd']);
    });

    it('computeSharedIngredients cae a la unión cuando la intersección es chica', () => {
      const players = [{ ingredients: ['a', 'b'] }, { ingredients: ['c', 'd'] }];
      expect(s().computeSharedIngredients(players).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('cookTimeToLimitSec aplica piso de 5 min y techo de 60 min', () => {
      expect(s().cookTimeToLimitSec(30)).toBe(1800);
      expect(s().cookTimeToLimitSec(3)).toBe(300); // piso 5 min
      expect(s().cookTimeToLimitSec(120)).toBe(3600); // techo 60 min
      expect(s().cookTimeToLimitSec(undefined)).toBe(1800); // default 30 min
    });

    it('normalizeIngredients limpia, normaliza y deduplica', () => {
      const out = s().normalizeIngredients(['Rice ', 'rice', 'x', '  Egg ', 123]);
      expect(out).toEqual(['rice', 'egg']); // 'x' (len<2) y 123 (no string) descartados
    });

    it('normalizeMeal solo acepta comidas válidas', () => {
      expect(s().normalizeMeal('dinner')).toBe('dinner');
      expect(s().normalizeMeal('banquete')).toBeNull();
      expect(s().normalizeMeal(undefined)).toBeNull();
    });
  });

  // =========================
  // Matchmaking (joinBattle)
  // =========================
  describe('joinBattle', () => {
    beforeEach(() => {
      jest.useFakeTimers(); // evita timers reales colgando del test
    });
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('rechaza un modo inválido', async () => {
      await expect(service.joinBattle(USER, { mode: 'duelo_loco' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza my_ingredients con menos de 2 ingredientes', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO', requestsUsed: 0 });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      await expect(
        service.joinBattle(USER, { mode: 'my_ingredients', ingredients: ['rice'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza a usuarios FREE (el Duelo es solo PRO/CHEF)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'FREE', requestsUsed: 0 });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      await expect(
        service.joinBattle(USER, { mode: 'chef_choice' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reconecta al usuario si ya está en una batalla activa', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO' });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue({ battleId: 'B1', battle: {} });
      prisma.cookBattle.findUnique.mockResolvedValue(minimalBattle({ id: 'B1' }));

      const res = await service.joinBattle(USER, { mode: 'chef_choice' });
      expect(res.battleId).toBe('B1');
      expect(prisma.cookBattle.create).not.toHaveBeenCalled();
    });

    it('se une a una sala existente cuando comparten ingredientes (my_ingredients)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO' });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      prisma.cookBattle.findMany.mockResolvedValue([
        {
          id: 'B1',
          lobbyExpiresAt: new Date(Date.now() + 100000),
          players: [{ ingredients: ['rice', 'egg', 'oil'] }],
        },
      ]);
      prisma.cookBattlePlayer.create.mockResolvedValue({});
      prisma.cookBattle.findUnique.mockResolvedValue(minimalBattle({ id: 'B1' }));

      const res = await service.joinBattle(USER, {
        mode: 'my_ingredients',
        ingredients: ['rice', 'egg'],
      });

      expect(res.battleId).toBe('B1');
      expect(prisma.cookBattlePlayer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ battleId: 'B1' }) }),
      );
      expect(prisma.cookBattle.create).not.toHaveBeenCalled();
    });

    it('crea sala nueva cuando NO hay solapamiento de ingredientes (sin llamar a la IA)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO' });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      prisma.cookBattle.findMany.mockResolvedValue([
        {
          id: 'B1',
          lobbyExpiresAt: new Date(Date.now() + 100000),
          players: [{ ingredients: ['beef', 'tomato'] }],
        },
      ]);
      prisma.cookBattle.create.mockResolvedValue({
        id: 'B2',
        lobbyExpiresAt: new Date(Date.now() + 120000),
      });
      prisma.cookBattle.findUnique.mockResolvedValue(minimalBattle({ id: 'B2', mode: 'my_ingredients' }));

      const res = await service.joinBattle(USER, {
        mode: 'my_ingredients',
        ingredients: ['rice', 'egg'],
      });

      expect(res.battleId).toBe('B2');
      expect(prisma.cookBattle.create).toHaveBeenCalled();
      // En my_ingredients la receta se genera al ARRANCAR, no al crear la sala
      expect(openai.generarReceta).not.toHaveBeenCalled();
    });

    it('rechaza chef_choice sin recipeOptionId', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO' });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      await expect(service.joinBattle(USER, { mode: 'chef_choice' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('crea sala chef_choice con la receta del catálogo elegida (sin generar con IA)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO', requestsUsed: 0 });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      prisma.battleRecipeOption.findUnique.mockResolvedValue({
        id: 'OPT1', mealTime: 'dinner',
        recipeData: { title: 'Tacos', ingredients: ['tortilla'], tools: ['sartén'], steps: ['paso 1'], cookTime: 20 },
      });
      prisma.cookBattle.findMany.mockResolvedValue([]); // no hay candidatas
      prisma.cookBattle.create.mockResolvedValue({
        id: 'B2',
        lobbyExpiresAt: new Date(Date.now() + 120000),
      });
      prisma.cookBattle.findUnique.mockResolvedValue(minimalBattle({ id: 'B2' }));

      const res = await service.joinBattle(USER, { mode: 'chef_choice', recipeOptionId: 'OPT1' });

      expect(res.battleId).toBe('B2');
      // La receta viene del catálogo: NO se llama a la IA al unirse
      expect(openai.generarReceta).not.toHaveBeenCalled();
      expect(prisma.cookBattle.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ recipeOptionId: 'OPT1' }) }),
      );
    });

    it('empareja chef_choice solo con quienes eligieron la misma receta', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, plan: 'PRO' });
      prisma.cookBattlePlayer.findFirst.mockResolvedValue(null);
      prisma.battleRecipeOption.findUnique.mockResolvedValue({
        id: 'OPT1', mealTime: 'lunch',
        recipeData: { title: 'Pasta', ingredients: ['pasta'], tools: ['olla'], steps: ['x'], cookTime: 15 },
      });
      prisma.cookBattle.findMany.mockResolvedValue([
        { id: 'OTHER', recipeOptionId: 'OPT2', lobbyExpiresAt: new Date(Date.now() + 100000), players: [{}] },
        { id: 'SAME', recipeOptionId: 'OPT1', lobbyExpiresAt: new Date(Date.now() + 100000), players: [{}] },
      ]);
      prisma.cookBattlePlayer.create.mockResolvedValue({});
      prisma.cookBattle.findUnique.mockResolvedValue(minimalBattle({ id: 'SAME' }));

      const res = await service.joinBattle(USER, { mode: 'chef_choice', recipeOptionId: 'OPT1' });

      expect(res.battleId).toBe('SAME');
      expect(prisma.cookBattlePlayer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ battleId: 'SAME' }) }),
      );
      expect(prisma.cookBattle.create).not.toHaveBeenCalled();
    });
  });

  // =========================
  // Juzgado — transición atómica cooking→judging (anti doble juez / doble XP)
  // =========================
  describe('judgeBattle (carrera foto final vs timer)', () => {
    const cookingBattle = () =>
      minimalBattle({
        id: 'B1',
        status: 'cooking',
        mode: 'chef_choice',
        recipeTitle: 'Tacos',
        players: [
          { id: 'p1', userId: 1, photoUrl: 'https://storage/battles/1.jpg', photoSubmitted: true, user: { name: 'Ana' } },
          { id: 'p2', userId: 2, photoUrl: 'https://storage/battles/2.jpg', photoSubmitted: true, user: { name: 'Beto' } },
        ],
      });

    it('NO juzga si otro flujo ya ganó la transición (updateMany count=0)', async () => {
      prisma.cookBattle.findUnique.mockResolvedValue(cookingBattle());
      prisma.cookBattle.updateMany.mockResolvedValue({ count: 0 });

      await (service as any).judgeBattle('B1');

      expect(openai.juzgarBatalla).not.toHaveBeenCalled();
      expect(stats.awardXp).not.toHaveBeenCalled();
    });

    it('con status judging y sin recovery NO re-juzga (solo el reinicio puede re-entrar)', async () => {
      prisma.cookBattle.findUnique.mockResolvedValue(cookingBattle());
      prisma.cookBattle.findUnique.mockResolvedValueOnce(
        minimalBattle({ ...cookingBattle(), status: 'judging' }),
      );

      await (service as any).judgeBattle('B1');

      expect(prisma.cookBattle.updateMany).not.toHaveBeenCalled();
      expect(openai.juzgarBatalla).not.toHaveBeenCalled();
    });

    it('cuando gana la transición juzga y reparte XP UNA sola vez', async () => {
      prisma.cookBattle.findUnique.mockResolvedValue(cookingBattle());
      prisma.cookBattle.updateMany.mockResolvedValue({ count: 1 });
      openai.juzgarBatalla.mockResolvedValue({
        ranking: [
          { userId: 1, rank: 1, score: 90, comment: '' },
          { userId: 2, rank: 2, score: 70, comment: '' },
        ],
        summary: 'ok',
      });
      prisma.cookBattlePlayer.update.mockResolvedValue({});
      prisma.cookBattlePlayer.updateMany.mockResolvedValue({});
      prisma.cookBattle.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      await (service as any).judgeBattle('B1');

      expect(openai.juzgarBatalla).toHaveBeenCalledTimes(1);
      expect(stats.awardXp).toHaveBeenCalledTimes(2); // 1 por jugador, no doble
      // Las fotos se borran del bucket al cerrar
      expect(storage.deleteImages).toHaveBeenCalledWith([
        'https://storage/battles/1.jpg',
        'https://storage/battles/2.jpg',
      ]);
    });
  });
});
