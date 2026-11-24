import { HttpException } from '@nestjs/common';
import { MarketService } from './market.service';

// Mercado PRO/CHEF: gate de plan, CRUD + ownership, nota opcional, y precios por
// estimación IA (fail-open). Mismo patrón que el resto: new Service(mocks), sin DB ni DI.

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    marketItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data })),
      update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<any>[]) => Promise.all(ops)),
  };
}

function makeOpenai() {
  return { estimarPrecios: jest.fn().mockResolvedValue(new Map()) };
}

function makeAiUsage() {
  return {
    assertDailyAiLimit: jest.fn().mockImplementation((u: any) => Promise.resolve(u)),
    bumpDailyAiUsage: jest.fn().mockResolvedValue(undefined),
  };
}

const freeUser = { id: 1, plan: 'FREE', aiUsageDate: null, aiUsageCount: 0 };
const proUser = { id: 2, plan: 'PRO', aiUsageDate: null, aiUsageCount: 0 };

function build(overrides: { user?: any } = {}) {
  const prisma = makePrisma();
  const openai = makeOpenai();
  const aiUsage = makeAiUsage();
  prisma.user.findUnique.mockResolvedValue(overrides.user ?? proUser);
  const service = new MarketService(prisma as any, openai as any, aiUsage as any);
  return { service, prisma, openai, aiUsage };
}

describe('MarketService — sin gate de plan (mercado gratis, todos los planes)', () => {
  it('FREE puede usar getItems, addItem y generateMarket sin 403', async () => {
    const { service, openai } = build({ user: freeUser });
    openai.estimarPrecios.mockResolvedValue(new Map());
    await expect(service.getItems(1)).resolves.toEqual([]);
    await expect(service.addItem(1, { name: 'Milk' })).resolves.toMatchObject({ name: 'Milk' });
    await expect(service.generateMarket(1, [{ name: 'Milk' }])).resolves.toMatchObject({ priceMode: 'none' });
  });

  it('usuario inexistente → 404 (sí se sigue verificando)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getItems(999)).rejects.toMatchObject({ status: 404 });
  });

  it('PRO también funciona (sin cambios de comportamiento)', async () => {
    const { service, prisma } = build();
    prisma.marketItem.findMany.mockResolvedValue([]);
    await expect(service.getItems(2)).resolves.toEqual([]);
  });
});

describe('MarketService — CRUD, nota y ownership', () => {
  it('add genérico → guarda nombre + nota opcional, sin precio ni foto', async () => {
    const { service } = build();
    const item = await service.addItem(2, { name: 'Milk', note: 'Oatly pref.' });
    expect(item).toMatchObject({ name: 'Milk', note: 'Oatly pref.' });
    // El mercado ya no maneja fotos ni precios al añadir (el precio lo pone el estimador).
    expect(item).not.toHaveProperty('imageUrl', expect.anything());
  });

  it('add sin nota → note null; nota en blanco → null', async () => {
    const { service } = build();
    await expect(service.addItem(2, { name: 'Eggs' })).resolves.toMatchObject({ note: null });
    await expect(service.addItem(2, { name: 'Eggs', note: '   ' })).resolves.toMatchObject({ note: null });
  });

  it('update de la nota de un ítem propio', async () => {
    const { service, prisma } = build();
    prisma.marketItem.findFirst.mockResolvedValue({ id: 5, userId: 2 });
    const res = await service.updateItem(2, 5, { note: 'Any brand' });
    expect(res).toMatchObject({ note: 'Any brand' });
  });

  it('update/delete de un ítem ajeno → 404', async () => {
    const { service, prisma } = build();
    prisma.marketItem.findFirst.mockResolvedValue(null); // no es suyo
    await expect(service.updateItem(2, 99, { checked: true })).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteItem(2, 99)).rejects.toMatchObject({ status: 404 });
  });

  it('clearChecked borra solo los comprados del usuario', async () => {
    const { service, prisma } = build();
    await expect(service.clearChecked(2)).resolves.toEqual({ deleted: 2 });
    expect(prisma.marketItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: 2, checked: true },
    });
  });
});

describe('MarketService — generateMarket (precio por IA)', () => {
  it('1 llamada batch a estimarPrecios + bump del cupo diario → priceSource ai', async () => {
    const { service, openai, aiUsage } = build();
    openai.estimarPrecios.mockResolvedValue(new Map([['Milk', 300], ['Eggs', null]]));

    const res = await service.generateMarket(2, [{ name: 'Milk' }, { name: 'Eggs' }]);
    expect(openai.estimarPrecios).toHaveBeenCalledTimes(1);
    expect(openai.estimarPrecios).toHaveBeenCalledWith(['Milk', 'Eggs']);
    expect(aiUsage.bumpDailyAiUsage).toHaveBeenCalledTimes(1);
    expect(res.priceMode).toBe('ai');
    const milk = res.items.find((i: any) => i.name === 'Milk');
    const eggs = res.items.find((i: any) => i.name === 'Eggs');
    expect(milk).toMatchObject({ priceCents: 300, priceSource: 'ai' });
    expect(eggs).toMatchObject({ priceCents: null, priceSource: null });
  });

  it('cupo diario agotado → 429 ANTES de llamar a OpenAI (y no crea ítems)', async () => {
    const { service, openai, aiUsage } = build();
    aiUsage.assertDailyAiLimit.mockRejectedValue(new HttpException('DAILY_LIMIT_REACHED', 429));
    await expect(service.generateMarket(2, [{ name: 'Milk' }])).rejects.toMatchObject({ status: 429 });
    expect(openai.estimarPrecios).not.toHaveBeenCalled();
  });

  it('la IA falla → fail-open: ítems creados sin precio', async () => {
    const { service, openai } = build();
    openai.estimarPrecios.mockRejectedValue(new Error('AI returned invalid JSON'));
    const res = await service.generateMarket(2, [{ name: 'Milk' }]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ priceCents: null, priceSource: null });
    expect(res.priceMode).toBe('none');
  });

  it('dedup case-insensitive contra existentes y dentro del payload', async () => {
    const { service, prisma, openai } = build();
    prisma.marketItem.findMany.mockResolvedValue([{ name: 'milk' }]);
    openai.estimarPrecios.mockResolvedValue(new Map([['Eggs', 420]]));

    const res = await service.generateMarket(2, [
      { name: 'Milk' }, // ya existe (lowercase)
      { name: 'Eggs' },
      { name: 'eggs' }, // duplicado del payload
    ]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Eggs');
  });

  it('payload vacío o todo duplicado → { items: [], priceMode: none } sin llamadas', async () => {
    const { service, openai } = build();
    const res = await service.generateMarket(2, []);
    expect(res).toEqual({ items: [], priceMode: 'none' });
    expect(openai.estimarPrecios).not.toHaveBeenCalled();
  });
});

describe('MarketService — estimatePrices (in-place)', () => {
  it('pone precio SOLO a los ítems sin precio y no crea filas', async () => {
    const { service, prisma, openai } = build();
    prisma.marketItem.findMany.mockResolvedValue([
      { id: 10, name: 'Milk' },
      { id: 11, name: 'Eggs' },
    ]);
    openai.estimarPrecios.mockResolvedValue(new Map([['Milk', 300], ['Eggs', null]]));

    const res = await service.estimatePrices(2);
    expect(prisma.marketItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 2, priceCents: null } }),
    );
    // Solo Milk consiguió precio → 1 update, ninguna creación.
    expect(res.updated).toHaveLength(1);
    expect(prisma.marketItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: { priceCents: 300, priceSource: 'ai' },
      }),
    );
    expect(prisma.marketItem.create).not.toHaveBeenCalled();
  });

  it('sin ítems sin precio → no llama a la IA', async () => {
    const { service, prisma, openai } = build();
    prisma.marketItem.findMany.mockResolvedValue([]);
    const res = await service.estimatePrices(2);
    expect(res).toEqual({ updated: [] });
    expect(openai.estimarPrecios).not.toHaveBeenCalled();
  });

  it('cupo diario agotado → 429', async () => {
    const { service, prisma, aiUsage } = build();
    prisma.marketItem.findMany.mockResolvedValue([{ id: 10, name: 'Milk' }]);
    aiUsage.assertDailyAiLimit.mockRejectedValue(new HttpException('DAILY_LIMIT_REACHED', 429));
    await expect(service.estimatePrices(2)).rejects.toMatchObject({ status: 429 });
  });

  it('FREE también puede estimar precios (sin gate de plan)', async () => {
    const { service, prisma, openai } = build({ user: freeUser });
    prisma.marketItem.findMany.mockResolvedValue([{ id: 10, name: 'Milk' }]);
    openai.estimarPrecios.mockResolvedValue(new Map([['Milk', 300]]));
    await expect(service.estimatePrices(1)).resolves.toMatchObject({ updated: [{ id: 10, priceCents: 300, priceSource: 'ai' }] });
  });
});
