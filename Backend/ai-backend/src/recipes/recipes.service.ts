import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, HttpException,
} from '@nestjs/common';
import { Cron, Timeout, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenaiService, MenuPreferences, CALORIE_GOAL_RANGES, NUTRITION_GOAL_LABELS } from '../ai/openai.service';
import { CacheService } from '../cache/cache.service';
import { StatsService } from '../stats/stats.service';
import { isPaid, isChef } from '../common/plans';
import { XP } from '../common/xp';
import { computePersonalGoal } from '../common/personal-goal';

const FREE_LIMIT = 3;
// Tope DIARIO de generaciones de IA para planes de pago (anti-runaway/abuso de costos OpenAI).
// FREE no entra aquí (ya está topado a 3 de por vida con requestsUsed).
const DAILY_AI_CAP_PRO = 40;
const DAILY_AI_CAP_CHEF = 100;
const RECENT_TITLES_LIMIT = 10;

@Injectable()
export class RecipesService {

  constructor(
    private prisma: PrismaService,
    private openaiService: OpenaiService,
    private cacheService: CacheService,
    private statsService: StatsService,
  ) {}

  private readonly logger = new Logger(RecipesService.name);

  // 🔥 Pre-genera la receta del día GLOBAL de todas las franjas (ambos idiomas) para el día
  // actual, así el peek del dashboard es siempre lectura cacheada e instantánea y ningún
  // usuario espera a OpenAI en la primera carga del día. Idempotente: si ya existe, no hace nada.
  private async prewarmDailyRecipes(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const franjas = ['breakfast', 'lunch', 'snack', 'dinner'];
    for (const language of ['en', 'es'] as const) {
      for (const mealTime of franjas) {
        try {
          await this.getOrCreateGlobalDailyRecipe(mealTime, language, today, false);
        } catch (e) {
          this.logger.warn(`Prewarm receta del día falló (${mealTime}/${language}): ${(e as Error)?.message ?? e}`);
        }
      }
    }
  }

  // Calienta la caché al arrancar (~8s tras el boot) y cada hora. La corrida horaria cubre
  // el cambio de día UTC: la primera después de medianoche genera las recetas del nuevo día.
  @Timeout(8000)
  async prewarmDailyRecipesOnBoot(): Promise<void> {
    await this.prewarmDailyRecipes();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async prewarmDailyRecipesHourly(): Promise<void> {
    await this.prewarmDailyRecipes();
  }

  private async getRecentTitles(userId: number): Promise<string[]> {
    const recent = await this.prisma.recipe.findMany({
      where: { userId }, select: { title: true },
      orderBy: { createdAt: 'desc' }, take: RECENT_TITLES_LIMIT,
    });
    return recent.map(r => r.title);
  }

  // Historial GLOBAL de títulos de la receta del día (todas las franjas y días) para
  // evitar repeticiones. Se pasa al prompt como exclusiones.
  private async getRecentGlobalDailyTitles(language: 'en' | 'es', limit = 60): Promise<string[]> {
    const recent = await this.prisma.dailyRecipe.findMany({
      where: { language }, select: { title: true },
      orderBy: { createdAt: 'desc' }, take: limit,
    });
    return recent.map(r => r.title);
  }

  // Normaliza un título para el dedup global (sin acentos, minúsculas, sin signos).
  private normalizeTitle(title: string): string {
    return title.normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Lock en memoria para no generar dos veces la misma receta global concurrentemente.
  private dailyLock = new Map<string, Promise<any>>();

  // Devuelve la receta del día GLOBAL para (franja, idioma, día). La genera una sola
  // vez (el primer usuario que la revela); el resto la reciben cacheada.
  private async getOrCreateGlobalDailyRecipe(mealTime: string, language: 'en' | 'es', dateKey: string, countServe = true): Promise<any> {
    const existing = await this.prisma.dailyRecipe.findUnique({
      where: { dateKey_mealTime_language: { dateKey, mealTime, language } },
    });
    if (existing) {
      // Solo contamos "served" cuando el usuario prepara de verdad, no en cada peek del dashboard.
      if (countServe) {
        await this.prisma.dailyRecipe.update({ where: { id: existing.id }, data: { timesServed: { increment: 1 } } });
      }
      return existing.recipeData;
    }

    const lockKey = `${language}:${dateKey}:${mealTime}`;
    const inFlight = this.dailyLock.get(lockKey);
    if (inFlight) return inFlight;
    const job = this.generateGlobalDaily(mealTime, language, dateKey)
      .finally(() => this.dailyLock.delete(lockKey));
    this.dailyLock.set(lockKey, job);
    return job;
  }

  // Genera la receta global del día (genérica, sin perfil de usuario) con dedup contra
  // el historial global. Reintenta si el modelo devuelve un título ya usado.
  private async generateGlobalDaily(mealTime: string, language: 'en' | 'es', dateKey: string): Promise<any> {
    const exclusions = await this.getRecentGlobalDailyTitles(language);
    // Prompts por tipo: platos familiares y populares, con ejemplos para guiar variedad
    // sin forzar fusiones raras. Son la guía creativa de la receta del día.
    const mealPrompts: Record<string, Record<string, string>> = {
      en: {
        breakfast: 'A familiar, popular breakfast (eggs, oatmeal, pancakes, toast, yogurt bowl, smoothie...). Quick and nutritious, under 20 min.',
        lunch: 'A balanced, satisfying lunch main (grain or rice bowl, pasta, grilled protein with a side, hearty salad, wrap...). Practical for a weekday.',
        dinner: 'A cozy, comforting dinner (baked dish, stew, pasta, roast, stir-fry...). Can be a bit more elaborate but still home-friendly.',
        snack: 'A light, quick snack or small bite — NOT a full meal (toast, veggie dip, energy bites, fruit & yogurt, quesadilla, hummus...). Under 10 min.',
        dessert: 'An easy homemade dessert anyone can make (mug cake, cookies, fruit crumble, pudding, brownies...). No professional pastry.',
        drink: 'A refreshing NON-ALCOHOLIC drink (smoothie, fresh juice, lemonade, iced tea, fruit infusion...). No alcohol.',
        cocktail: 'A well-known classic cocktail (mojito, margarita, daiquiri, negroni...). Include clear measures.',
        surprise: 'Any familiar, crowd-pleasing dish that is fun and delicious. Keep it easy and home-friendly.',
      },
      es: {
        breakfast: 'Un desayuno familiar y popular (huevos, avena, panqueques, tostadas, bowl de yogur, smoothie...). Rápido y nutritivo, menos de 20 min.',
        lunch: 'Un almuerzo balanceado y saciante (bowl de arroz o granos, pasta, proteína a la plancha con guarnición, ensalada contundente, wrap...). Práctico para entre semana.',
        dinner: 'Una cena acogedora y reconfortante (plato al horno, guiso, pasta, asado, salteado...). Puede ser algo más elaborada pero casera.',
        snack: 'Un snack ligero o bocado pequeño — NO una comida completa (tostada, dip con vegetales, bolitas energéticas, yogur con fruta, quesadilla, hummus...). Menos de 10 min.',
        dessert: 'Un postre casero y fácil que cualquiera pueda hacer (mug cake, galletas, crumble de fruta, flan, brownies...). Sin repostería profesional.',
        drink: 'Una bebida refrescante SIN alcohol (smoothie, jugo natural, limonada, té helado, infusión de frutas...). Sin alcohol.',
        cocktail: 'Un cóctel clásico y conocido (mojito, margarita, daiquiri, negroni...). Incluye medidas claras.',
        surprise: 'Cualquier plato familiar y que guste a todos, divertido y delicioso. Mantenlo fácil y casero.',
      },
    };
    const baseMessage = mealPrompts[language]?.[mealTime] ?? mealPrompts['en']['lunch'];

    for (let attempt = 0; attempt < 5; attempt++) {
      const seed = Math.random().toString(36).slice(2, 8);
      let recipe: any;
      try {
        // skipModeration=true: prompt interno de confianza → no gastar/arriesgar el clasificador.
        recipe = await this.openaiService.generarReceta(`${baseMessage} (meal type: ${mealTime}) (seed: ${seed})`, null, false, language, [...exclusions], true);
      } catch (e) {
        // Hipo transitorio de OpenAI → reintentar; solo nos rendimos tras agotar los intentos.
        this.logger.warn(`Daily gen intento ${attempt + 1}/5 falló (${mealTime}/${language}): ${(e as Error)?.message ?? e}`);
        if (attempt === 4) throw new BadRequestException('Could not generate daily recipe.');
        continue;
      }

      // En el último intento forzamos un titleKey único para no quedar sin receta del día.
      const lastAttempt = attempt === 4;
      const titleKey = this.normalizeTitle(recipe.title) + (lastAttempt ? `-${dateKey}-${mealTime}` : '');
      try {
        const saved = await this.prisma.dailyRecipe.create({
          data: { dateKey, mealTime, language, title: recipe.title, titleKey, recipeData: recipe as object, timesServed: 1 },
        });
        return saved.recipeData;
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // ¿Otra petición ya generó la global de hoy? úsala (carrera entre instancias)
          const slot = await this.prisma.dailyRecipe.findUnique({
            where: { dateKey_mealTime_language: { dateKey, mealTime, language } },
          });
          if (slot) return slot.recipeData;
          // Título repetido: excluirlo y reintentar
          exclusions.push(recipe.title);
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Could not generate a unique daily recipe.');
  }

  // =========================
  // 🔥 ACTUALIZAR RACHA
  // =========================
  private async updateStreak(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cookingStreak: true, lastCookedAt: true },
    });
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastCooked = user.lastCookedAt ? new Date(user.lastCookedAt) : null;
    if (lastCooked) lastCooked.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = 1;
    if (lastCooked) {
      if (lastCooked.getTime() === today.getTime()) {
        // Ya cocinó hoy — no cambia la racha
        return;
      } else if (lastCooked.getTime() === yesterday.getTime()) {
        // Cocinó ayer — suma 1
        newStreak = (user.cookingStreak ?? 0) + 1;
      }
      // Si fue hace más días — resetea a 1
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { cookingStreak: newStreak, lastCookedAt: today },
    });
  }

  // =========================
  // 💡 SUGERENCIAS
  // =========================
  async getSuggestions(userId: number, mealType: string | null, language: 'en' | 'es' = 'en') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const recentRecipes = await this.prisma.recipe.findMany({
      where: { userId }, select: { title: true, isFavorite: true },
      orderBy: { createdAt: 'desc' }, take: 10,
    });

    const recentTitles = recentRecipes.map(r => r.title);
    const favoriteTitles = recentRecipes.filter(r => r.isFavorite).map(r => r.title);

    try {
      const result = await this.openaiService.generarSugerencias(user, mealType, language, recentTitles, favoriteTitles);
      return { suggestions: result };
    } catch {
      return { suggestions: [] };
    }
  }

  // =========================
  // 🍳 GENERAR RECETA (con cache)
  // =========================
  async generateRecipe(userId: number, message: string, language: 'en' | 'es' = 'en') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isFreeTrial = user.plan === 'FREE';
    if (isFreeTrial && (user.requestsUsed ?? 0) >= FREE_LIMIT) throw new ForbiddenException('LIMIT_REACHED');
    this.assertDailyAiLimit(user); // tope diario PRO/CHEF (no-op para FREE)

    // ── Meta personalizada: inyectar el target de kcal por plato ───────────
    // Solo si el mensaje no trae ya un hint de calorías (el planner mete el suyo).
    const personalGoal = computePersonalGoal(user);
    const personalized = Boolean(personalGoal) && !/calorie target/i.test(message);
    if (personalized && personalGoal) {
      message = `${message} (calorie target: about ${personalGoal.perMealKcal} kcal per serving)`;
    }

    // ── Extraer parámetros del mensaje para la clave de cache ──────────────
    const mealTypeMatch = message.match(/\(meal type:\s*(\w+)\)/i);
    const mealType = mealTypeMatch?.[1] ?? 'any';

    const ingredientsMatch = message.match(/\(use these ingredients:\s*([^)]+)\)/i);
    const rawIngredients = ingredientsMatch
      ? ingredientsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const timeMatch = message.match(/\(available time:\s*(\d+)/i);
    const cookTimeLimit = timeMatch ? parseInt(timeMatch[1], 10) : 999;

    // Validar el pedido ANTES del cache: la cacheKey se arma solo con
    // mealType+ingredientes+tiempo (no con el texto libre), así que un texto
    // inválido/random podía "acertar" una entrada cacheada y devolver una receta
    // real pero ajena a lo pedido, sin pasar nunca por el clasificador.
    await this.openaiService.assertValidRecipeRequest(message, mealType === 'any' ? null : mealType);

    // ── Intentar cache ─────────────────────────────────────────────────────
    const cacheResult = await this.cacheService.lookup({
      mealType,
      ingredients: rawIngredients,
      cookTimeLimit,
      userDietType: user.dietType ?? 'omnivore',
      userAllergies: user.allergies,
    });

    let recipe: Record<string, any>;
    let globalRecipeId: string | null = null;

    // Con meta personalizada NO se sirve del cache (la clave ignora el hint de kcal
    // → serviría una receta genérica que no respeta el target) ni se guarda en él.
    if (cacheResult.hit && !personalized) {
      // ── Cache HIT: servir receta cacheada (0 tokens OpenAI) ──────────────
      recipe = cacheResult.recipe as Record<string, any>;
      globalRecipeId = cacheResult.globalRecipeId;
    } else {
      // ── Cache MISS (o receta personalizada): generar fresco con IA ────────
      const recentTitles = await this.getRecentTitles(userId);
      try {
        // Ya validamos arriba (assertValidRecipeRequest antes del cache) → skipModeration
        // para no repetir el clasificador en cache-miss.
        recipe = await this.openaiService.generarReceta(message, user, isFreeTrial, language, recentTitles, true);
      } catch (error: any) {
        if (error?.message === 'NOT_FOOD_RELATED' || error?.message === 'MEAL_TYPE_MISMATCH') throw error;
        throw new BadRequestException('Could not generate recipe. Try again.');
      }

      // Guardar en GlobalRecipe para futuras peticiones (nunca las personalizadas:
      // llevan un target de kcal ajeno al resto de usuarios)
      if (!cacheResult.hit) {
        globalRecipeId = await this.cacheService.save({
          cacheKey: cacheResult.cacheKey,
          normalizedIngredients: cacheResult.normalizedIngredients,
          timeBand: cacheResult.timeBand,
          mealType,
          recipe: recipe as Record<string, unknown>,
          skipCache: cacheResult.skipCache || personalized,
        });
      }
    }

    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const tools = Array.isArray(recipe.tools) ? recipe.tools : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    // Tip por paso (alineado a steps). Recetas cacheadas viejas no lo traen → []
    // y siguen mostrando su `tip` general como fallback en el frontend.
    const stepTips = Array.isArray(recipe.stepTips) ? recipe.stepTips : [];
    // Nutrición por porción. Recetas cacheadas viejas (GlobalRecipe) no la traen → null
    // y el frontend no muestra la sección.
    const nutrition = recipe.nutrition ?? null;

    const newRecipe = await this.prisma.recipe.create({
      data: {
        userId, title: recipe.title,
        description: recipe.description ?? null, tip: recipe.tip ?? null,
        ingredients, tools, steps, stepTips,
        nutrition: nutrition ?? undefined,
        difficulty: recipe.difficulty, cookTime: recipe.cookTime,
        globalRecipeId: globalRecipeId ?? undefined,
      },
    });

    const conversation = await this.prisma.conversation.create({
      data: { userId, recipeId: newRecipe.id, title: recipe.title },
    });

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id, role: 'assistant',
        content: `${recipe.title}\n${recipe.description ?? ''}\nIngredients:\n${ingredients.join('\n')}\nSteps:\n${steps.map((s: string, i: number) => `${i+1}. ${s}`).join('\n')}${recipe.tip ? `\n💡 ${recipe.tip}` : ''}`.trim(),
      },
    });

    if (isFreeTrial) {
      await this.prisma.user.update({ where: { id: userId }, data: { requestsUsed: { increment: 1 } } });
    }
    await this.bumpDailyAiUsage(user); // suma al cupo diario PRO/CHEF (no-op para FREE)

    // 🔥 Actualizar racha de cocina
    await this.updateStreak(userId);

    return {
      conversationId: conversation.id, recipeId: newRecipe.id,
      requestsUsed: isFreeTrial ? (user.requestsUsed ?? 0) + 1 : null,
      requestsLimit: isFreeTrial ? FREE_LIMIT : null,
      recipe: { title: recipe.title, description: recipe.description ?? null, ingredients, tools, steps, stepTips, nutrition, difficulty: recipe.difficulty, cookTime: recipe.cookTime, tip: recipe.tip ?? null },
    };
  }

  // =========================
  // 📸📝 ANALIZAR FRIDGE
  // Enruta a foto (gpt-4o) o texto (gpt-4.1-mini) según lo que llegue
  // =========================
  async analyzeFridge(
    userId: number, imagesBase64: string[], mealTime: string,
    language: 'en' | 'es' = 'en', textIngredients?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    this.assertDailyAiLimit(user); // tope diario PRO/CHEF (no-op para FREE)

    const recentTitles = await this.getRecentTitles(userId);

    try {
      const result = (textIngredients && textIngredients.trim().length > 3)
        // Modo texto — usa gpt-4.1-mini (más barato)
        ? await this.openaiService.analizarFridgeTexto(textIngredients, mealTime, user, language, recentTitles)
        // Modo foto — usa gpt-4o (visión)
        : await this.openaiService.analizarFridge(imagesBase64, mealTime, user, language, recentTitles);
      await this.bumpDailyAiUsage(user); // suma al cupo diario tras el éxito
      return result;
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? 'Could not analyze.');
    }
  }

  // =========================
  // 🌅 RECETA DEL DÍA
  // =========================
  async getDailyRecipe(userId: number, mealTime: string, language: 'en' | 'es' = 'en', generate = false) {
    const today = new Date().toISOString().split('T')[0];

    // ¿Ya la preparó hoy? La copia per-usuario existe → devolverla con id, sin cobrar de nuevo.
    const existing = await this.prisma.recipe.findFirst({
      where: { userId, isDailyRecipe: true, mealTime, dailyDate: new Date(today) },
    });

    if (existing) {
      return { cached: true, prepared: true, recipe: { id: existing.id, title: existing.title, description: existing.description, ingredients: existing.ingredients, tools: existing.tools, steps: existing.steps, stepTips: existing.stepTips ?? [], nutrition: existing.nutrition ?? null, difficulty: existing.difficulty, cookTime: existing.cookTime, tip: existing.tip, mealTime: existing.mealTime } };
    }

    // La receta del día es GLOBAL (una por franja/idioma/día). MOSTRARLA es gratis: el peek
    // (generate=false) trae el contenido pero NO crea copia ni cobra. Solo "Preparar receta"
    // (generate=true) crea la copia per-usuario y consume 1 crédito FREE.
    const globalRecipe = await this.getOrCreateGlobalDailyRecipe(mealTime, language, today, generate);

    const ingredients = Array.isArray(globalRecipe.ingredients) ? globalRecipe.ingredients : [];
    const tools = Array.isArray(globalRecipe.tools) ? globalRecipe.tools : [];
    const steps = Array.isArray(globalRecipe.steps) ? globalRecipe.steps : [];
    // Tip por paso. Recetas del día generadas antes de este cambio no lo traen → []
    // y muestran su `tip` general como fallback.
    const stepTips = Array.isArray(globalRecipe.stepTips) ? globalRecipe.stepTips : [];
    // Nutrición por porción. Globales generadas antes de este cambio no la traen → null.
    const nutrition = globalRecipe.nutrition ?? null;

    // Peek (dashboard): contenido para mostrar, sin copia ni cobro. id = null → aún no preparada.
    if (!generate) {
      return { cached: false, prepared: false, recipe: { id: null, title: globalRecipe.title, description: globalRecipe.description ?? null, ingredients, tools, steps, stepTips, nutrition, difficulty: globalRecipe.difficulty, cookTime: globalRecipe.cookTime, tip: globalRecipe.tip ?? null, mealTime } };
    }

    // Preparar: verifica límite, crea copia per-usuario (favoritos/historial) y cobra 1.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const isFreeTrial = user.plan === 'FREE';
    if (isFreeTrial && (user.requestsUsed ?? 0) >= FREE_LIMIT) throw new ForbiddenException('LIMIT_REACHED');
    this.assertDailyAiLimit(user); // tope diario PRO/CHEF (no-op para FREE)

    const saved = await this.prisma.recipe.create({
      data: { userId, title: globalRecipe.title, description: globalRecipe.description ?? null, tip: globalRecipe.tip ?? null, ingredients, tools, steps, stepTips, nutrition: nutrition ?? undefined, difficulty: globalRecipe.difficulty, cookTime: globalRecipe.cookTime, isDailyRecipe: true, mealTime, dailyDate: new Date(today) },
    });

    // Crear la conversación (+ mensaje inicial) para que el chat del chef funcione
    // en esta receta, igual que en generateRecipe.
    const conversation = await this.prisma.conversation.create({
      data: { userId, recipeId: saved.id, title: saved.title },
    });
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id, role: 'assistant',
        content: `${saved.title}\n${saved.description ?? ''}\nIngredients:\n${ingredients.join('\n')}\nSteps:\n${steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}${saved.tip ? `\n💡 ${saved.tip}` : ''}`.trim(),
      },
    });

    if (isFreeTrial) {
      await this.prisma.user.update({ where: { id: userId }, data: { requestsUsed: { increment: 1 } } });
    }
    await this.bumpDailyAiUsage(user); // suma al cupo diario PRO/CHEF (no-op para FREE)

    return { cached: false, prepared: true, recipe: { id: saved.id, title: saved.title, description: saved.description, ingredients, tools, steps, stepTips, nutrition, difficulty: saved.difficulty, cookTime: saved.cookTime, tip: saved.tip, mealTime }, conversationId: conversation.id };
  }

  // =========================
  // 📚 LISTAR RECETAS
  // =========================
  async getUserRecipes(userId: number) {
    const recipes = await this.prisma.recipe.findMany({
      where: { userId, isDailyRecipe: false },
      select: { id: true, title: true, description: true, difficulty: true, cookTime: true, isFavorite: true, folderId: true, createdAt: true, conversation: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return recipes.map(r => ({ ...r, conversationId: r.conversation?.id ?? null }));
  }

  async getRecipeById(userId: number, recipeId: number) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, userId }, include: { conversation: { select: { id: true } } } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    // Red de seguridad: si la receta no tiene conversación (p. ej. recetas del día
    // preparadas antes de este fix), la creamos al vuelo para que el chat del chef
    // funcione. Idempotente: solo crea si falta.
    let conversationId = recipe.conversation?.id ?? null;
    if (conversationId == null) {
      try {
        const conv = await this.prisma.conversation.create({ data: { userId, recipeId: recipe.id, title: recipe.title } });
        conversationId = conv.id;
      } catch {
        // si otra petición la creó en paralelo, recuperarla
        const conv = await this.prisma.conversation.findFirst({ where: { recipeId: recipe.id } });
        conversationId = conv?.id ?? null;
      }
    }
    return { ...recipe, conversationId };
  }

  async toggleFavorite(userId: number, recipeId: number) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    const updated = await this.prisma.recipe.update({ where: { id: recipeId }, data: { isFavorite: !recipe.isFavorite } });
    return { recipeId: updated.id, isFavorite: updated.isFavorite };
  }

  // =========================
  // 🔥 CALORÍAS DE LA SEMANA — suma la nutrición (por porción) de las recetas cuyo
  // Modo Cocina se terminó esta semana (cookedAt; semana = lunes 00:00 UTC, igual que
  // las misiones). Solo cuentan recetas con panel de nutrición; las antiguas sin
  // nutrition no aportan. cookedAt se setea UNA vez por receta → re-cocinar no re-suma.
  // =========================
  async getWeeklyNutrition(userId: number) {
    const now = new Date();
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));

    const cooked = await this.prisma.recipe.findMany({
      where: { userId, cookedAt: { gte: weekStart } },
      select: { cookedAt: true, nutrition: true },
    });

    const perDay = [0, 0, 0, 0, 0, 0, 0]; // lunes..domingo
    let totalCalories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let mealsCount = 0;
    for (const r of cooked) {
      const nutrition = r.nutrition as { calories?: number; protein?: number; carbs?: number; fat?: number } | null;
      const calories = typeof nutrition?.calories === 'number' ? nutrition.calories : 0;
      if (calories <= 0 || !r.cookedAt) continue;
      const dayIndex = (r.cookedAt.getUTCDay() + 6) % 7;
      perDay[dayIndex] += calories;
      totalCalories += calories;
      protein += typeof nutrition?.protein === 'number' ? nutrition.protein : 0;
      carbs += typeof nutrition?.carbs === 'number' ? nutrition.carbs : 0;
      fat += typeof nutrition?.fat === 'number' ? nutrition.fat : 0;
      mealsCount++;
    }

    return {
      weekStart: weekStart.toISOString(),
      totalCalories,
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      perDay,
      mealsCount,
    };
  }

  // =========================
  // ⭐ MARCAR RECETA COCINADA (Modo Cocina terminado) → otorga XP global
  // Idempotente: solo la 1ª vez por receta (cookedAt) suma XP, así no se farmea.
  // Exige una foto del plato terminado y la verifica con visión IA contra la receta
  // (verificarPlatoCocinado, muy permisiva) ANTES de otorgar el XP — sin esto, cualquiera
  // podía tocar "Terminar" sin haber cocinado nada. La foto nunca se guarda: se manda a
  // OpenAI y se descarta.
  // =========================
  async markRecipeCooked(userId: number, recipeId: number, photoBase64: string) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (recipe.cookedAt) {
      return { awarded: false, xpGained: 0 };
    }

    const cleanPhoto = (photoBase64 ?? '').replace(/^data:image\/\w+;base64,/, '').trim();
    if (cleanPhoto.length < 100) throw new BadRequestException('PHOTO_REQUIRED');

    let verdict: { matches: boolean; confidence: number; reason: string };
    try {
      verdict = await this.openaiService.verificarPlatoCocinado(cleanPhoto, recipe.title, recipe.description ?? null);
    } catch {
      throw new BadRequestException('PHOTO_VERIFICATION_FAILED');
    }
    if (!verdict.matches) {
      throw new BadRequestException({ message: 'PHOTO_MISMATCH', reason: verdict.reason });
    }

    await this.prisma.recipe.update({ where: { id: recipeId }, data: { cookedAt: new Date() } });
    const res = await this.statsService.awardXp(userId, XP.COOK_MODE);
    return { awarded: true, xpGained: XP.COOK_MODE, nivel: res.nivel, leveledUp: res.leveledUp, xpTotal: res.xpTotal, verified: true };
  }

  async deleteRecipe(userId: number, recipeId: number) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    const conversation = await this.prisma.conversation.findFirst({ where: { recipeId } });
    if (conversation) {
      await this.prisma.message.deleteMany({ where: { conversationId: conversation.id } });
      await this.prisma.conversation.delete({ where: { id: conversation.id } });
    }
    await this.prisma.recipe.delete({ where: { id: recipeId } });
    return { success: true, recipeId };
  }

  async createFolder(userId: number, name: string) {
    if (!name?.trim()) throw new BadRequestException('Name is required');
    const existing = await this.prisma.recipeFolder.findFirst({ where: { userId, name: name.trim() } });
    if (existing) throw new BadRequestException('A folder with this name already exists');
    return this.prisma.recipeFolder.create({ data: { userId, name: name.trim() } });
  }

  async getUserFolders(userId: number) {
    const folders = await this.prisma.recipeFolder.findMany({ where: { userId }, include: { _count: { select: { recipes: true } } }, orderBy: { createdAt: 'asc' } });
    return folders.map(f => ({ id: f.id, name: f.name, recipeCount: f._count.recipes, createdAt: f.createdAt }));
  }

  async renameFolder(userId: number, folderId: number, name: string) {
    if (!name?.trim()) throw new BadRequestException('Name is required');
    const folder = await this.prisma.recipeFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Folder not found');
    return this.prisma.recipeFolder.update({ where: { id: folderId }, data: { name: name.trim() } });
  }

  async deleteFolder(userId: number, folderId: number) {
    const folder = await this.prisma.recipeFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Folder not found');
    await this.prisma.recipe.updateMany({ where: { folderId, userId }, data: { folderId: null } });
    await this.prisma.recipeFolder.delete({ where: { id: folderId } });
    return { success: true, folderId };
  }

  async moveRecipeToFolder(userId: number, recipeId: number, folderId: number | null) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (folderId !== null) {
      const folder = await this.prisma.recipeFolder.findFirst({ where: { id: folderId, userId } });
      if (!folder) throw new NotFoundException('Folder not found');
    }
    const updated = await this.prisma.recipe.update({ where: { id: recipeId }, data: { folderId } });
    return { recipeId: updated.id, folderId: updated.folderId };
  }

  // =========================
  // 🗓️ PLANIFICADOR SEMANAL (PRO/CHEF)
  // =========================
  private readonly PLAN_MEALS = ['breakfast', 'lunch', 'dinner'];

  // Normaliza una fecha 'YYYY-MM-DD' a medianoche UTC. Si es inválida usa hoy.
  private normalizeDay(dateStr: string): Date {
    const d = new Date(`${(dateStr || '').slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(d.getTime())) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    return d;
  }

  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // ── Tope diario de IA (solo PRO/CHEF) ─────────────────────────────────
  // FREE ya está limitado por requestsUsed (3 de por vida). Esto protege contra un bucle
  // o abuso que dispare la factura de OpenAI. Reset por día (UTC). Cuenta solo éxitos.
  private dailyAiCap(plan: string): number | null {
    if (isChef(plan)) return DAILY_AI_CAP_CHEF;
    if (isPaid(plan)) return DAILY_AI_CAP_PRO;
    return null; // FREE → no aplica
  }

  // Lanza 429 DAILY_LIMIT_REACHED si el usuario de pago ya agotó su cupo de hoy.
  private assertDailyAiLimit(user: { plan: string; aiUsageDate: Date | null; aiUsageCount: number }) {
    const cap = this.dailyAiCap(user.plan);
    if (cap == null) return;
    const sameDay = !!user.aiUsageDate && this.dayKey(user.aiUsageDate) === this.dayKey(new Date());
    const used = sameDay ? (user.aiUsageCount ?? 0) : 0;
    if (used >= cap) throw new HttpException('DAILY_LIMIT_REACHED', 429);
  }

  // Suma 1 al cupo de hoy tras una generación exitosa (resetea el contador si cambió el día).
  private async bumpDailyAiUsage(user: { id: number; plan: string; aiUsageDate: Date | null; aiUsageCount: number }) {
    if (this.dailyAiCap(user.plan) == null) return;
    const sameDay = !!user.aiUsageDate && this.dayKey(user.aiUsageDate) === this.dayKey(new Date());
    const used = sameDay ? (user.aiUsageCount ?? 0) : 0;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { aiUsageCount: used + 1, aiUsageDate: new Date() },
    });
  }

  private serializeEntry(e: any) {
    return {
      id: e.id,
      mealTime: e.mealTime,
      title: e.title,
      description: e.description ?? null,
      difficulty: e.difficulty ?? null,
      cookTime: e.cookTime ?? null,
      recipeId: e.recipeId ?? null,
      prepared: e.recipeId != null,
      source: e.source,
    };
  }

  // Verifica que el usuario sea PRO/CHEF — todo el planner es premium.
  private async assertPaidUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!isPaid(user.plan)) throw new ForbiddenException('PRO_ONLY');
    return user;
  }

  // Devuelve la semana completa (7 días) agrupada por día y franja.
  async getMealPlan(userId: number, weekStart: string, _language: 'en' | 'es' = 'en') {
    const start = this.normalizeDay(weekStart);
    const end = new Date(start.getTime() + 7 * 86400000);

    // Gate PRO + lectura en PARALELO (round-trips a us-west-2 ~155ms c/u): si el
    // usuario no es de pago, Promise.all rechaza igual y la lectura extra es inocua.
    const [, entries] = await Promise.all([
      this.assertPaidUser(userId),
      this.prisma.mealPlanEntry.findMany({
        where: { userId, date: { gte: start, lt: end } },
      }),
    ]);

    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start.getTime() + i * 86400000);
      const key = this.dayKey(date);
      const meals: Record<string, any> = {};
      for (const meal of this.PLAN_MEALS) {
        const hit = entries.find(e => this.dayKey(e.date) === key && e.mealTime === meal);
        meals[meal] = hit ? this.serializeEntry(hit) : null;
      }
      return { date: key, dayIndex: i, meals };
    });

    return { weekStart: this.dayKey(start), days };
  }

  // Crea/actualiza un slot: receta existente (recipeId) o entrada manual (title).
  async setMealPlanSlot(
    userId: number,
    input: { date: string; mealTime: string; recipeId?: number | null; title?: string; description?: string },
  ) {
    await this.assertPaidUser(userId);
    const { date, mealTime } = input;
    if (!this.PLAN_MEALS.includes(mealTime)) throw new BadRequestException('Invalid mealTime');
    const day = this.normalizeDay(date);

    let data: { title: string; description: string | null; difficulty: string | null; cookTime: number | null; recipeId: number | null; source: string };

    if (input.recipeId != null) {
      const recipe = await this.prisma.recipe.findFirst({ where: { id: input.recipeId, userId } });
      if (!recipe) throw new NotFoundException('Recipe not found');
      data = {
        title: recipe.title, description: recipe.description ?? null,
        difficulty: recipe.difficulty ?? null, cookTime: recipe.cookTime ?? null,
        recipeId: recipe.id, source: 'existing',
      };
    } else {
      const title = input.title?.trim();
      if (!title) throw new BadRequestException('title or recipeId is required');
      data = {
        title: title.slice(0, 120), description: input.description?.trim().slice(0, 240) ?? null,
        difficulty: null, cookTime: null, recipeId: null, source: 'manual',
      };
    }

    const entry = await this.prisma.mealPlanEntry.upsert({
      where: { userId_date_mealTime: { userId, date: day, mealTime } },
      create: { userId, date: day, mealTime, ...data },
      update: data,
    });
    return this.serializeEntry(entry);
  }

  async removeMealPlanSlot(userId: number, entryId: number) {
    await this.assertPaidUser(userId);
    const entry = await this.prisma.mealPlanEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) throw new NotFoundException('Plan entry not found');
    await this.prisma.mealPlanEntry.delete({ where: { id: entryId } });
    return { success: true, id: entryId };
  }

  // Mueve un slot a otro día/franja. Si el destino está vacío → lo reubica.
  // Si está ocupado → INTERCAMBIA (swap) el contenido de ambos slots, así el
  // planner sigue siendo útil aunque la semana esté llena tras "Generar menú".
  async moveMealPlanSlot(userId: number, entryId: number, target: { date?: string; mealTime?: string }) {
    await this.assertPaidUser(userId);
    const entry = await this.prisma.mealPlanEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) throw new NotFoundException('Plan entry not found');

    const mealTime = target.mealTime ?? entry.mealTime;
    if (!this.PLAN_MEALS.includes(mealTime)) throw new BadRequestException('Invalid mealTime');
    const date = target.date ? this.normalizeDay(target.date) : entry.date;

    // Mismo slot → no-op
    if (this.dayKey(date) === this.dayKey(entry.date) && mealTime === entry.mealTime) {
      return this.serializeEntry(entry);
    }

    const occupant = await this.prisma.mealPlanEntry.findFirst({
      where: { userId, date, mealTime, id: { not: entryId } },
    });

    // Destino vacío → simple reubicación
    if (!occupant) {
      const updated = await this.prisma.mealPlanEntry.update({
        where: { id: entryId }, data: { date, mealTime },
      });
      return this.serializeEntry(updated);
    }

    // Destino ocupado → swap del contenido (los slots quedan fijos, sin colisión de unique).
    // El plato "movido" termina viviendo en el slot destino (id del ocupante).
    const payload = (e: typeof entry) => ({
      title: e.title, description: e.description, difficulty: e.difficulty,
      cookTime: e.cookTime, recipeId: e.recipeId, source: e.source,
      // el snapshot de prefs viaja con el plato al intercambiar slots
      prefs: e.prefs === null ? Prisma.DbNull : (e.prefs as Prisma.InputJsonValue),
    });
    await this.prisma.$transaction([
      this.prisma.mealPlanEntry.update({ where: { id: entry.id }, data: payload(occupant) }),
      this.prisma.mealPlanEntry.update({ where: { id: occupant.id }, data: payload(entry) }),
    ]);
    const moved = await this.prisma.mealPlanEntry.findUnique({ where: { id: occupant.id } });
    return this.serializeEntry(moved);
  }

  // Whitelist de las preferencias nutricionales del sheet (vienen del cliente como `any`).
  // El resultado se pasa al prompt semanal Y se persiste como snapshot en cada entry para
  // que el "Prepare" (que genera la Recipe completa) respete lo mismo que se planeó.
  private sanitizePlanPrefs(preferences: MenuPreferences): {
    calorieGoal: string | null; nutritionGoals: string[]; servings: number | null;
  } {
    const calorieGoal = preferences.calorieGoal && CALORIE_GOAL_RANGES[preferences.calorieGoal]
      ? preferences.calorieGoal : null;
    const nutritionGoals = Array.isArray(preferences.nutritionGoals)
      ? preferences.nutritionGoals.filter(g => typeof g === 'string' && NUTRITION_GOAL_LABELS[g]) : [];
    const servingsNum = Number(preferences.servings);
    const servings = [1, 2, 4].includes(servingsNum) ? servingsNum : null;
    return { calorieGoal, nutritionGoals, servings };
  }

  // Genera el menú de toda la semana con IA (1 llamada barata). Llena los slots
  // vacíos o no preparados; NUNCA pisa un slot ya cocinado (recipeId != null).
  async generateWeeklyMenu(
    userId: number, weekStart: string, meals: string[],
    language: 'en' | 'es' = 'en', preferences: MenuPreferences = {},
  ) {
    const user = await this.assertPaidUser(userId);
    this.assertDailyAiLimit(user); // tope diario PRO/CHEF
    const start = this.normalizeDay(weekStart);
    const end = new Date(start.getTime() + 7 * 86400000);
    const mealList = (meals ?? []).filter(m => this.PLAN_MEALS.includes(m));
    const targetMeals = mealList.length > 0 ? mealList : this.PLAN_MEALS;

    const planPrefs = this.sanitizePlanPrefs(preferences);
    const recentTitles = await this.getRecentTitles(userId);
    const menu = await this.openaiService.generarMenuSemanal(
      user, targetMeals, language, recentTitles, { ...preferences, ...planPrefs },
    );
    await this.bumpDailyAiUsage(user); // cuenta la generación del menú (1 unidad)

    // Slots ya preparados que NO se deben pisar
    const prepared = await this.prisma.mealPlanEntry.findMany({
      where: { userId, date: { gte: start, lt: end }, recipeId: { not: null } },
      select: { date: true, mealTime: true },
    });
    const lockedKeys = new Set(prepared.map(p => `${this.dayKey(p.date)}|${p.mealTime}`));

    // No generar recetas para días ya pasados (si hoy es martes, Lun no se rellena).
    const todayKey = this.dayKey(new Date());

    const ops: any[] = [];
    menu.forEach((dayMenu, i) => {
      const date = new Date(start.getTime() + i * 86400000);
      if (this.dayKey(date) < todayKey) return; // día anterior a hoy → omitir
      for (const meal of targetMeals) {
        const item = dayMenu[meal];
        if (!item?.title) continue;
        if (lockedKeys.has(`${this.dayKey(date)}|${meal}`)) continue;
        const data = {
          title: item.title, description: item.description || null,
          difficulty: item.difficulty || null, cookTime: item.cookTime || null,
          recipeId: null, source: 'ai_weekly',
          prefs: planPrefs as Prisma.InputJsonValue, // snapshot para el Prepare
        };
        ops.push(
          this.prisma.mealPlanEntry.upsert({
            where: { userId_date_mealTime: { userId, date, mealTime: meal } },
            create: { userId, date, mealTime: meal, ...data },
            update: data,
          }),
        );
      }
    });

    if (ops.length > 0) await this.prisma.$transaction(ops);
    return this.getMealPlan(userId, this.dayKey(start), language);
  }

  // "Preparar": genera (o recupera) la Recipe completa de un slot planeado.
  // Reutiliza generateRecipe (cache + persistencia). PRO/CHEF → sin límite.
  async prepareMealPlanEntry(userId: number, entryId: number, language: 'en' | 'es' = 'en') {
    await this.assertPaidUser(userId);
    const entry = await this.prisma.mealPlanEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) throw new NotFoundException('Plan entry not found');

    // Ya preparada → devolver la receta existente sin regenerar
    if (entry.recipeId != null) {
      const recipe = await this.prisma.recipe.findFirst({ where: { id: entry.recipeId, userId } });
      if (recipe) {
        const conversation = await this.prisma.conversation.findFirst({ where: { recipeId: recipe.id } });
        return { entryId: entry.id, recipeId: recipe.id, conversationId: conversation?.id ?? null, alreadyPrepared: true };
      }
    }

    // Hints nutricionales del sheet (snapshot guardado al generar la semana) → la
    // Recipe completa respeta la meta de kcal, los objetivos y las porciones planeadas.
    const prefs = entry.prefs as { calorieGoal?: string | null; nutritionGoals?: string[]; servings?: number | null } | null;
    const hints: string[] = [];
    if (prefs?.calorieGoal && CALORIE_GOAL_RANGES[prefs.calorieGoal]) {
      hints.push(`(calorie target: ${CALORIE_GOAL_RANGES[prefs.calorieGoal]} kcal per serving)`);
    }
    const goals = (prefs?.nutritionGoals ?? []).filter(g => NUTRITION_GOAL_LABELS[g]);
    if (goals.length) hints.push(`(nutrition goals: ${goals.map(g => NUTRITION_GOAL_LABELS[g]).join(', ')})`);
    if (prefs?.servings) hints.push(`(servings: ${prefs.servings})`);

    const descPart = entry.description ? ` - ${entry.description}` : '';
    const hintPart = hints.length ? ` ${hints.join(' ')}` : '';
    const message = `${entry.title}${descPart} (meal type: ${entry.mealTime})${hintPart}`;
    const result = await this.generateRecipe(userId, message, language);

    await this.prisma.mealPlanEntry.update({
      where: { id: entry.id }, data: { recipeId: result.recipeId },
    });

    return { entryId: entry.id, recipeId: result.recipeId, conversationId: result.conversationId, alreadyPrepared: false, recipe: result.recipe };
  }
}