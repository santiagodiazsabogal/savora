import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenaiService } from '../ai/openai.service';
import { AiUsageService } from '../ai/ai-usage.service';

// Mercado (grocery list) — TODOS LOS PLANES. Lista simple de comida GENÉRICA (el buscador
// de comidas vive en el frontend, estático, con emoji — sin marcas ni API externa). Cada
// ítem puede llevar una nota opcional (p.ej. preferencia de marca) y un precio estimado
// por IA. Precios en centavos USD.
//
// (2026-07-13) Se eliminó toda la etapa Kroger/Open Food Facts/catálogo propio: las fotos
// de producto cargaban lento y traían resultados raros. Ahora el precio es SOLO estimación
// IA (openai.estimarPrecios); si la IA falla, el ítem queda sin precio (la lista sirve igual).
// (2026-07-13) Se quitó el gate PRO/CHEF: el mercado es gratis para poder soportar el flujo
// "cualquier receta, compro lo que falte" desde RecipeSuggestions sin muro de plan.

const MAX_GENERATE_ITEMS = 40;
const MAX_NAME_LEN = 60;
const MAX_NOTE_LEN = 80;

export interface GenerateItemInput {
  name: string;
  quantity?: string | null;
  recipeTitle?: string | null;
}

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenaiService,
    private readonly aiUsage: AiUsageService,
  ) {}

  // Sin gate de plan — el mercado es gratis para todos. Se mantiene el nombre/forma
  // (devuelve el user, como antes) para no tocar las ~10 llamadas que dependen de él.
  private async assertPaidUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getItems(userId: number) {
    await this.assertPaidUser(userId);
    return this.prisma.marketItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addItem(userId: number, dto: { name: string; quantity?: string; note?: string }) {
    await this.assertPaidUser(userId);
    return this.prisma.marketItem.create({
      data: {
        userId,
        name: (dto.name ?? '').trim().slice(0, MAX_NAME_LEN),
        quantity: dto.quantity?.trim().slice(0, 30) || null,
        note: dto.note?.trim().slice(0, MAX_NOTE_LEN) || null,
      },
    });
  }

  async updateItem(
    userId: number,
    id: number,
    dto: { name?: string; quantity?: string; note?: string; priceCents?: number | null; checked?: boolean },
  ) {
    await this.assertPaidUser(userId);
    const item = await this.prisma.marketItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Item not found');

    const patch: Record<string, any> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, MAX_NAME_LEN);
    if (dto.quantity !== undefined) patch.quantity = dto.quantity?.trim().slice(0, 30) || null;
    if (dto.note !== undefined) patch.note = dto.note?.trim().slice(0, MAX_NOTE_LEN) || null;
    if (dto.checked !== undefined) patch.checked = dto.checked;
    if (dto.priceCents !== undefined) {
      patch.priceCents = dto.priceCents;
      patch.priceSource = dto.priceCents == null ? null : 'manual';
    }
    return this.prisma.marketItem.update({ where: { id }, data: patch });
  }

  async deleteItem(userId: number, id: number) {
    await this.assertPaidUser(userId);
    const item = await this.prisma.marketItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.marketItem.delete({ where: { id } });
    return { deleted: true };
  }

  async clearChecked(userId: number) {
    await this.assertPaidUser(userId);
    const res = await this.prisma.marketItem.deleteMany({ where: { userId, checked: true } });
    return { deleted: res.count };
  }

  // Estima precios de una tanda de nombres con IA (1 llamada batch, cuenta en el presupuesto
  // diario). Devuelve un Map nombre→centavos. El 429 del cupo diario se propaga; cualquier
  // otro fallo de la IA → Map vacío (fail-open: ítems sin precio). Reutilizado por
  // generateMarket y estimatePrices.
  private async aiPrices(user: any, names: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (names.length === 0) return prices;
    try {
      const aiUser = await this.aiUsage.assertDailyAiLimit(user); // 429 si agotó el cupo
      const estimated = await this.openai.estimarPrecios(names);
      for (const [name, cents] of estimated) {
        if (cents != null) prices.set(name.toLowerCase(), cents);
      }
      await this.aiUsage.bumpDailyAiUsage(aiUser);
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 429) throw e;
    }
    return prices;
  }

  // Genera el mercado: crea los ítems (deduplicados contra los existentes) y les pone
  // precio con IA. Si la IA falla, los ítems se crean igual sin precio (fail-open).
  // Lo usa el flujo de "faltantes de receta" (recipes → mercado).
  async generateMarket(userId: number, items: GenerateItemInput[]) {
    const user = await this.assertPaidUser(userId);

    // Sanitizar + dedup interno del payload.
    const seen = new Set<string>();
    const clean = (items ?? [])
      .map((i) => ({
        name: (i?.name ?? '').trim().slice(0, MAX_NAME_LEN),
        quantity: i?.quantity?.trim().slice(0, 30) || null,
        recipeTitle: i?.recipeTitle?.trim().slice(0, 80) || null,
      }))
      .filter((i) => {
        if (!i.name) return false;
        const key = i.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_GENERATE_ITEMS);
    if (clean.length === 0) return { items: [], priceMode: 'none' as const };

    // Dedup contra lo que ya está en la lista (case-insensitive) — los repetidos se omiten.
    const existing = await this.prisma.marketItem.findMany({
      where: { userId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));
    const toCreate = clean.filter((i) => !existingNames.has(i.name.toLowerCase()));
    if (toCreate.length === 0) return { items: [], priceMode: 'none' as const };

    const prices = await this.aiPrices(user, toCreate.map((i) => i.name));

    const created = await this.prisma.$transaction(
      toCreate.map((i) => {
        const cents = prices.get(i.name.toLowerCase()) ?? null;
        return this.prisma.marketItem.create({
          data: {
            userId,
            name: i.name,
            quantity: i.quantity,
            recipeTitle: i.recipeTitle,
            priceCents: cents,
            priceSource: cents == null ? null : 'ai',
          },
        });
      }),
    );

    const priceMode = created.some((c) => c.priceSource === 'ai') ? ('ai' as const) : ('none' as const);
    return { items: created, priceMode };
  }

  // Pone precio IN-PLACE a los ítems del usuario que no tienen (estimación IA, sin crear
  // filas). Para el botón "Estimate prices" y el auto-estimado al añadir.
  async estimatePrices(userId: number) {
    const user = await this.assertPaidUser(userId);
    const unpriced = await this.prisma.marketItem.findMany({
      where: { userId, priceCents: null },
      select: { id: true, name: true },
    });
    if (unpriced.length === 0) return { updated: [] };

    const names = [...new Set(unpriced.map((i) => i.name))].slice(0, MAX_GENERATE_ITEMS);
    const prices = await this.aiPrices(user, names);

    const toUpdate = unpriced.filter((i) => prices.has(i.name.toLowerCase()));
    const updated = await this.prisma.$transaction(
      toUpdate.map((i) =>
        this.prisma.marketItem.update({
          where: { id: i.id },
          data: { priceCents: prices.get(i.name.toLowerCase())!, priceSource: 'ai' },
        }),
      ),
    );
    return { updated };
  }
}
