import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { BadgesService } from '../badges/badges.service';
import { ClansService } from '../clans/clans.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { XP } from '../common/xp';
import { CATEGORY_ROADMAP, RECIPES_PER_CATEGORY, skillIdOf, skillById } from './roadmap.config';

const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';
// API hermana para bebidas (misma estructura que TheMealDB). Cócteles y jugos salen de aquí.
const COCKTAILDB_BASE = 'https://www.thecocktaildb.com/api/json/v1/1';
// Los ids de bebida se guardan prefijados (p.ej. "d_11007") para no colisionar con los idMeal
// de TheMealDB (ambos son números). El prefijo enruta el lookup a la API correcta.
const DRINK_PREFIX = 'd_';
// Los módulos de TÉCNICA del roadmap se guardan con id namespaced (p.ej. "path_knife"): no vienen
// de ninguna API, su syllabus se genera desde un `seed` curado (ver roadmap.config.ts).
const TECHNIQUE_PREFIX = 'path_';

// Topes de USO de los cursos (DE POR VIDA, cuenta GLOBAL sobre todas las lecciones/cursos, tanto
// del roadmap como del catálogo). El acceso está abierto a todos los planes; el plan define cuánto
// se puede avanzar: FREE prueba 3 lecciones; PRO completa hasta 3 cursos; CHEF ilimitado.
const COURSE_LIMITS: Record<string, { lessons: number; courses: number }> = {
  FREE: { lessons: 3, courses: 0 },               // 3 lecciones (nunca llega a completar un curso)
  PRO: { lessons: Infinity, courses: 3 },         // hasta 3 cursos completos
  CHEF: { lessons: Infinity, courses: Infinity },  // ilimitado
};
const limitsFor = (plan?: string | null) => COURSE_LIMITS[plan ?? 'FREE'] ?? COURSE_LIMITS.FREE;

type CatalogItem = { idMeal: string; strMeal: string; strMealThumb: string };

// Caché TTL en memoria de las APIs externas (TheMealDB/TheCocktailDB): la lista de
// recetas de una categoría es estática en la práctica, y sin caché CADA apertura del
// catálogo/roadmap pagaba un round-trip externo (~200-600ms). 6h de vida.
const EXTERNAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class CoursesAiService {
  private openai: OpenAI;
  private externalCache = new Map<string, { at: number; data: CatalogItem[] }>();
  // Lock anti-duplicado de generación de syllabus: si dos usuarios abren el mismo curso
  // no cacheado a la vez, solo el primero paga la llamada a OpenAI (el resto espera su
  // resultado). Mismo patrón que optionsLock en battle.service.
  private syllabusLocks = new Map<string, Promise<any>>();

  // Envuelve un fetch externo de lista con caché TTL por clave (categoría/query).
  private async cachedExternal(key: string, fetcher: () => Promise<CatalogItem[]>): Promise<CatalogItem[]> {
    const hit = this.externalCache.get(key);
    if (hit && Date.now() - hit.at < EXTERNAL_CACHE_TTL_MS) return hit.data;
    const data = await fetcher();
    // No cachear respuestas vacías (posible hipo de la API externa) para reintentar pronto.
    if (data.length > 0) this.externalCache.set(key, { at: Date.now(), data });
    return data;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
    private readonly badgesService: BadgesService,
    private readonly clansService: ClansService,
    private readonly aiUsage: AiUsageService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async getCatalog(userId: number, category: string) {
    // Usuario (DB) y lista de la categoría (API externa/caché) son independientes → paralelo.
    const [user, meals] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.fetchCategoryMeals(category),
    ]);
    const userLevel = user?.nivel ?? 1;

    const idMeals = meals.map((m) => m.idMeal);
    const [cached, completed] = await Promise.all([
      this.prisma.mealDbCourse.findMany({
        where: { idMeal: { in: idMeals } },
        select: { idMeal: true, nivelMinimo: true, strArea: true },
      }),
      this.prisma.userMealDbCourse.findMany({
        where: { userId, idMeal: { in: idMeals } },
        select: { idMeal: true },
      }),
    ]);

    const cachedMap = Object.fromEntries(cached.map(c => [c.idMeal, c]));
    const completedSet = new Set(completed.map(c => c.idMeal));

    // Para platos sin syllabus cacheado, buscar strArea en TheMealDB en paralelo.
    // Las bebidas (prefijo d_) no tienen área → se saltan el lookup.
    const uncachedIds = idMeals.filter(id => !cachedMap[id] && !this.isDrink(id));
    const fetchedAreaMap: Record<string, string | null> = {};
    if (uncachedIds.length > 0) {
      const results = await Promise.allSettled(
        uncachedIds.map(id =>
          fetch(`${MEALDB_BASE}/lookup.php?i=${id}`)
            .then(r => r.json())
            .then((d: any) => ({ id, area: (d.meals?.[0]?.strArea as string) ?? null }))
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') fetchedAreaMap[r.value.id] = r.value.area;
      }
    }

    return meals.map((meal) => {
      const entry = cachedMap[meal.idMeal];
      const nivelMinimo = entry?.nivelMinimo ?? null;
      return {
        idMeal: meal.idMeal,
        strMeal: meal.strMeal,
        thumbnailUrl: meal.strMealThumb,
        category,
        strArea: entry?.strArea ?? fetchedAreaMap[meal.idMeal] ?? null,
        nivelMinimo,
        bloqueado: nivelMinimo != null ? userLevel < nivelMinimo : false,
        completado: completedSet.has(meal.idMeal),
        lecciones: 5,
      };
    });
  }

  private isDrink(idMeal: string): boolean {
    return idMeal.startsWith(DRINK_PREFIX);
  }

  private isTechnique(idMeal: string): boolean {
    return idMeal.startsWith(TECHNIQUE_PREFIX);
  }

  // Puebla el grid de una categoría. Las categorías "sintéticas" se resuelven aquí:
  // - Cocktail / Juice → TheCocktailDB (ids prefijados con d_)
  // - SidesStarters → combina las categorías Side + Starter de TheMealDB en un solo grid
  private async fetchCategoryMeals(category: string): Promise<CatalogItem[]> {
    if (category === 'Cocktail') return this.fetchDrinks('c=Cocktail');
    if (category === 'Juice') return this.fetchDrinks('a=Non_Alcoholic');
    if (category === 'SidesStarters') {
      const [sides, starters] = await Promise.all([
        this.fetchMeals('Side'),
        this.fetchMeals('Starter'),
      ]);
      const seen = new Set<string>();
      return [...sides, ...starters].filter(m => {
        if (seen.has(m.idMeal)) return false;
        seen.add(m.idMeal);
        return true;
      });
    }
    return this.fetchMeals(category);
  }

  private fetchMeals(category: string): Promise<CatalogItem[]> {
    return this.cachedExternal(`meals:${category}`, async () => {
      const res = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`);
      const data = await res.json();
      return (data.meals ?? []).map((m: any) => ({
        idMeal: m.idMeal,
        strMeal: m.strMeal,
        strMealThumb: m.strMealThumb,
      }));
    });
  }

  private fetchDrinks(query: string): Promise<CatalogItem[]> {
    return this.cachedExternal(`drinks:${query}`, async () => {
      const res = await fetch(`${COCKTAILDB_BASE}/filter.php?${query}`);
      const data = await res.json();
      return (data.drinks ?? []).map((d: any) => ({
        idMeal: DRINK_PREFIX + d.idDrink,
        strMeal: d.strDrink,
        strMealThumb: d.strDrinkThumb,
      }));
    });
  }

  // Lookup normalizado de un plato (TheMealDB) o una bebida (TheCocktailDB, id prefijado d_).
  // Devuelve la misma forma para ambos para que la generación del syllabus sea agnóstica.
  private async lookupItem(idMeal: string): Promise<{
    name: string; category: string; area: string; thumb: string; ingredientes: string[]; instructions: string;
    kind: 'meal' | 'drink' | 'technique';
  } | null> {
    // Nodo de HABILIDAD del roadmap: no hay API externa, el contenido sale del seed curado.
    if (this.isTechnique(idMeal)) {
      const skill = skillById(idMeal);
      if (!skill) return null;
      return {
        name: skill.title,
        category: 'Skill',
        area: 'Cooking skill',
        thumb: '',
        ingredientes: [],
        instructions: skill.seed ?? skill.desc,
        kind: 'technique',
      };
    }

    if (this.isDrink(idMeal)) {
      const realId = idMeal.slice(DRINK_PREFIX.length);
      const res = await fetch(`${COCKTAILDB_BASE}/lookup.php?i=${encodeURIComponent(realId)}`);
      const data = await res.json();
      const d = data.drinks?.[0];
      if (!d) return null;
      const ingredientes: string[] = [];
      for (let i = 1; i <= 15; i++) {
        const ing = d[`strIngredient${i}`];
        const measure = d[`strMeasure${i}`];
        if (ing?.trim()) ingredientes.push(`${measure?.trim() ?? ''} ${ing.trim()}`.trim());
      }
      return {
        name: d.strDrink,
        // Categoría normalizada a la del app (Cocktail/Juice) para misiones/insignias por categoría.
        category: d.strAlcoholic === 'Alcoholic' ? 'Cocktail' : 'Juice',
        area: d.strAlcoholic ?? 'Drink',
        thumb: d.strDrinkThumb,
        ingredientes,
        instructions: d.strInstructions ?? '',
        kind: 'drink',
      };
    }

    const res = await fetch(`${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(idMeal)}`);
    const data = await res.json();
    const meal = data.meals?.[0];
    if (!meal) return null;
    const ingredientes: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const ing = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      if (ing?.trim()) ingredientes.push(`${measure?.trim() ?? ''} ${ing.trim()}`.trim());
    }
    return {
      name: meal.strMeal,
      category: meal.strCategory,
      area: meal.strArea,
      thumb: meal.strMealThumb,
      ingredientes,
      instructions: meal.strInstructions ?? '',
      kind: 'meal',
    };
  }

  // Detecta si un syllabus cacheado ya tiene el formato nuevo (con pasos por lección).
  private tienePasos(lecciones: any): boolean {
    return Array.isArray(lecciones)
      && lecciones.length > 0
      && Array.isArray(lecciones[0]?.pasos)
      && lecciones[0].pasos.length > 0;
  }

  // Formato aún más nuevo: cada paso trae `tip` (siempre) + `alerta` (opcional de seguridad).
  // Si el caché no lo tiene, se considera viejo y se regenera para enriquecerlo.
  private tieneStepTips(lecciones: any): boolean {
    return this.tienePasos(lecciones) && typeof lecciones[0].pasos[0]?.tip === 'string';
  }

  // Lecciones "de contenido" de un curso: como ahora se genera directo por idioma, el campo ES
  // (`lecciones`) puede estar vacío en cursos english-only → usa el que tenga contenido.
  private leccionesDe(course: any): any[] {
    const en = course?.leccionesEn;
    if (Array.isArray(en) && en.length) return en;
    const es = course?.lecciones;
    return Array.isArray(es) ? es : [];
  }

  // Garantiza que cada paso tenga `tip` y `alerta` como strings (evita undefined → cache/UI).
  private normalizarPasos(lecciones: any[]): void {
    for (const l of lecciones ?? []) {
      if (!Array.isArray(l?.pasos)) continue;
      for (const p of l.pasos) {
        if (typeof p.tip !== 'string') p.tip = '';
        if (typeof p.alerta !== 'string') p.alerta = '';
      }
    }
  }

  async getSyllabus(userId: number, idMeal: string, idioma: 'es' | 'en' = 'es') {
    const row = await this.ensureSyllabus(userId, idMeal, idioma);
    // Devolvemos las lecciones del idioma pedido en el campo `lecciones`.
    const lecciones = idioma === 'en' ? (row as any).leccionesEn : row.lecciones;
    return { ...row, lecciones };
  }

  // Garantiza el syllabus en el idioma pedido. Lo genera DIRECTO en ese idioma (1 llamada;
  // antes: generaba ES + traducía a EN = 2). ES → `lecciones`, EN → `leccionesEn`, independientes.
  // El caché es GRATIS; solo la GENERACIÓN cuenta contra el tope diario de IA del usuario
  // (antes cualquier usuario podía forzar generaciones ilimitadas pidiendo ids no cacheados).
  private async ensureSyllabus(userId: number, idMeal: string, idioma: 'es' | 'en' = 'es') {
    const field = idioma === 'en' ? 'leccionesEn' : 'lecciones';
    const cached = await this.prisma.mealDbCourse.findUnique({ where: { idMeal } });
    // Sirve el caché solo si ya trae pasos CON tip/alerta en el idioma pedido.
    if (cached && this.tieneStepTips((cached as any)[field])) return cached;

    // Dedup: si ya hay una generación en vuelo de este (curso, idioma), esperar su
    // resultado en vez de pagar una segunda llamada a OpenAI.
    const lockKey = `${idMeal}:${idioma}`;
    const inFlight = this.syllabusLocks.get(lockKey);
    if (inFlight) return inFlight;
    const job = this.generateSyllabus(userId, idMeal, idioma, field)
      .finally(() => this.syllabusLocks.delete(lockKey));
    this.syllabusLocks.set(lockKey, job);
    return job;
  }

  private async generateSyllabus(userId: number, idMeal: string, idioma: 'es' | 'en', field: string) {
    // Tope diario de IA (429 DAILY_LIMIT_REACHED). Solo paga quien dispara la generación.
    const aiUser = await this.aiUsage.assertDailyAiLimit(userId);

    const item = await this.lookupItem(idMeal);
    if (!item) throw new NotFoundException('Receta no encontrada');

    const prompt = item.kind === 'technique'
      ? this.buildTechniquePrompt(item, idioma)
      : this.buildRecipePrompt(item, this.isDrink(idMeal), idioma);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const syllabus = JSON.parse(completion.choices[0].message.content ?? '{}');
    this.normalizarPasos(syllabus.lecciones);

    const meta = {
      strMeal: item.name,
      strArea: item.area,
      strCategory: item.category,
      thumbnailUrl: item.thumb,
      nivelMinimo: syllabus.nivel_minimo,
    };
    const row = await this.prisma.mealDbCourse.upsert({
      where: { idMeal },
      create: {
        idMeal,
        ...meta,
        lecciones: field === 'lecciones' ? syllabus.lecciones : [],
        ...(field === 'leccionesEn' ? { leccionesEn: syllabus.lecciones } : {}),
      },
      update: { ...meta, [field]: syllabus.lecciones },
    });
    await this.aiUsage.bumpDailyAiUsage(aiUser); // cuenta solo éxitos
    return row;
  }

  private idiomaLabel(idioma: 'es' | 'en') {
    return idioma === 'en' ? 'inglés' : 'español';
  }

  // Prompt de receta/bebida, parametrizado por idioma de SALIDA (genera directo en ese idioma).
  private buildRecipePrompt(
    item: { name: string; category: string; area: string; ingredientes: string[]; instructions: string },
    esBebida: boolean,
    idioma: 'es' | 'en',
  ): string {
    const out = this.idiomaLabel(idioma);
    const rolExperto = esBebida ? 'bartender y mixólogo educador experto' : 'chef-educador experto';
    const dominio = esBebida ? 'coctelería y preparación de bebidas' : 'cocina';
    const accionMientras = esBebida ? 'prepara la bebida' : 'cocina';
    const tecnicaDesc = esBebida
      ? 'técnica de coctelería/mixología concreta (agitar en coctelera, remover, macerar, licuar, escarchar el vaso, decorar o hacer capas)'
      : 'técnica culinaria concreta';
    const tecnicaCorta = esBebida ? 'técnica de coctelería principal' : 'técnica culinaria principal';
    const ejemploPaso = esBebida
      ? (idioma === 'en' ? 'Fill the shaker with ice and pour 45 ml of tequila' : 'Llena la coctelera con hielo y vierte 45 ml de tequila')
      : (idioma === 'en' ? 'Bring 2 liters of water to a boil with a tablespoon of salt' : 'Pon a hervir 2 litros de agua con una cucharada de sal');

    return `Eres un ${rolExperto}. Diseña un curso interactivo de ${dominio}, de 5 lecciones progresivas, basado en esta receta real. El curso se ejecuta paso a paso: cada paso se le LEERÁ EN VOZ ALTA al usuario mientras ${accionMientras}, y al terminar de ejecutarlo pasa al siguiente.

Receta: ${item.name}
Categoría: ${item.category}
Área/Origen: ${item.area}
Ingredientes: ${item.ingredientes.slice(0, 15).join(', ')}
Instrucciones: ${item.instructions.slice(0, 800)}

Genera exactamente 5 lecciones con progresión real de principiante a avanzado.
Cada lección debe tener entre 4 y 6 pasos concretos y ejecutables.
Asigna un nivel_minimo al curso entero (número del 1 al 100) según la complejidad. IMPORTANTE: la mayoría de las recetas caseras comunes deben quedar en niveles BAJOS (1 a 8); reserva los niveles altos solo para técnicas realmente difíciles.
⚠️ TODO el texto visible del JSON ("titulo", "descripcion", "tecnica", y cada "texto", "tip" y "alerta") debe estar en ${out}.
Responde SOLO en JSON válido sin markdown ni backticks con este formato exacto:

{
  "nivel_minimo": 2,
  "lecciones": [
    {
      "numero": 1,
      "titulo": "...",
      "descripcion": "Máximo 2 oraciones explicando qué se aprende.",
      "tecnica": "nombre corto de la ${tecnicaCorta}",
      "pasos": [
        { "numero": 1, "texto": "Instrucción clara y ejecutable, una sola acción, lista para escucharse en voz alta.", "tip": "Un consejo práctico corto para este paso.", "alerta": "" }
      ]
    }
  ]
}

Reglas:
- Cada lección enseña UNA ${tecnicaDesc} y desarrolla una parte real de la preparación de la receta
- Las 5 lecciones juntas, paso a paso, deben permitir preparar la receta completa de principio a fin
- Cada paso: una sola acción, en imperativo, claro y natural para escucharse en voz alta (ej: "${ejemploPaso}")
- Cada paso incluye SIEMPRE un "tip": UNA frase corta con un consejo práctico (la técnica, por qué importa, o una mejora de chef)
- "alerta": SOLO si el paso tiene un riesgo real de seguridad (cuchillo afilado, aceite o superficie caliente, agua hirviendo, carne cruda o contaminación cruzada, alérgenos). Frase corta que empiece por el riesgo. Si el paso no tiene peligro, deja "" (cadena vacía). NO inventes alertas donde no hay riesgo
- Incluye cantidades, tiempos y temperaturas concretas cuando apliquen
- Entre 4 y 6 pasos por lección
- Títulos cortos y motivadores
- Descripciones de máximo 2 oraciones
- La progresión debe ser real: de lo más simple a lo más complejo
- TODO el texto visible debe estar en ${out}`;
  }

  // Prompt para módulos de TÉCNICA del roadmap (habilidad, no receta): 5 lecciones que
  // enseñan la habilidad de lo básico a lo avanzado, mismo formato JSON que el resto.
  private buildTechniquePrompt(item: { name: string; instructions: string }, idioma: 'es' | 'en'): string {
    const out = this.idiomaLabel(idioma);
    const ejemploPaso = idioma === 'en'
      ? 'Hold the knife with your thumb and index finger on the sides of the blade'
      : 'Sujeta el cuchillo con el pulgar y el índice a los lados de la hoja';
    return `Eres un chef-instructor experto. Diseña un curso interactivo de TÉCNICAS DE COCINA de 5 lecciones progresivas sobre la habilidad "${item.name}". El curso se practica paso a paso: cada paso se le LEERÁ EN VOZ ALTA al usuario mientras cocina/practica, y al terminar de ejecutarlo pasa al siguiente.

Habilidad a enseñar: ${item.name}
Qué debe cubrir el curso: ${item.instructions}

Genera exactamente 5 lecciones con progresión real (de lo más básico a lo más fino de la técnica).
Cada lección debe tener entre 4 y 6 pasos concretos y ejecutables.
Asigna un nivel_minimo al curso entero (número del 1 al 100). IMPORTANTE: son habilidades fundamentales, así que la mayoría deben quedar en niveles BAJOS (1 a 8) para principiantes.
⚠️ TODO el texto visible del JSON ("titulo", "descripcion", "tecnica", y cada "texto", "tip" y "alerta") debe estar en ${out}.
Responde SOLO en JSON válido sin markdown ni backticks con este formato exacto:

{
  "nivel_minimo": 2,
  "lecciones": [
    {
      "numero": 1,
      "titulo": "...",
      "descripcion": "Máximo 2 oraciones explicando qué se aprende.",
      "tecnica": "nombre corto de la sub-técnica de esta lección",
      "pasos": [
        { "numero": 1, "texto": "Instrucción clara y ejecutable, una sola acción, lista para escucharse en voz alta.", "tip": "Un consejo práctico corto para este paso.", "alerta": "" }
      ]
    }
  ]
}

Reglas:
- Cada lección enseña UNA sub-habilidad concreta y práctica dentro de "${item.name}"
- Las 5 lecciones juntas cubren la habilidad completa, de lo básico a lo avanzado
- Cada paso: una sola acción, en imperativo, claro y natural para escucharse en voz alta (ej: "${ejemploPaso}")
- Incluye detalles concretos (ángulos, tiempos, temperaturas, medidas) cuando apliquen
- Cada paso incluye SIEMPRE un "tip": UNA frase corta con un consejo práctico (la técnica, por qué importa, o una mejora)
- "alerta": SOLO si el paso tiene un riesgo real de seguridad (cuchillo afilado, aceite o superficie caliente, agua hirviendo, carne cruda o contaminación cruzada, alérgenos). Frase corta que empiece por el riesgo. Si el paso no tiene peligro, deja "" (cadena vacía). Para habilidades con cuchillo o calor, prioriza incluir alertas útiles donde de verdad importen
- Títulos cortos y motivadores
- Descripciones de máximo 2 oraciones
- La progresión debe ser real: de lo más simple a lo más complejo
- TODO el texto visible debe estar en ${out}`;
  }

  // Retroalimentación con visión (GPT-4o) sobre la foto del plato/bebida terminada.
  // gpt-4o es la llamada más cara del módulo → cuenta contra el tope diario de IA.
  async feedbackResult(userId: number, idMeal: string, imageBase64: string, idioma: 'es' | 'en' = 'es') {
    const [aiUser, course] = await Promise.all([
      this.aiUsage.assertDailyAiLimit(userId),
      this.prisma.mealDbCourse.findUnique({ where: { idMeal } }),
    ]);
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (!imageBase64) throw new NotFoundException('Falta la imagen');

    // Bebidas (cócteles/jugos) se evalúan como bartender; platos como chef.
    const esBebida = this.isDrink(idMeal);

    const prompt = idioma === 'en'
      ? (esBebida
        ? `You are a kind, motivating bartender-evaluator. The user just made the drink "${course.strMeal}" (${course.strCategory}) following a step-by-step course.

Look at the photo of their result and give feedback in English:
- Start with something positive and specific about what you see
- Point out 1 or 2 concrete things they could improve next time (presentation, color, garnish, glass choice, ice, layering)
- Close with a practical tip and a motivating phrase
- Maximum 4 sentences, warm and encouraging tone
- If the image does NOT look like a drink or a glass, kindly tell them and ask them to take a photo of their drink`
        : `You are a kind, motivating chef-evaluator. The user just cooked the dish "${course.strMeal}" (${course.strArea} cuisine, ${course.strCategory} category) following a step-by-step course.

Look at the photo of their result and give feedback in English:
- Start with something positive and specific about what you see
- Point out 1 or 2 concrete things they could improve next time (plating, color, texture, doneness)
- Close with a practical tip and a motivating phrase
- Maximum 4 sentences, warm and encouraging tone
- If the image does NOT look like a plate of food, kindly tell them and ask them to take a photo of their dish`)
      : (esBebida
        ? `Eres un bartender evaluador amable y motivador. El usuario acaba de preparar la bebida "${course.strMeal}" (${course.strCategory}) siguiendo un curso paso a paso.

Mira la foto de su resultado y dale retroalimentación en español:
- Empieza con algo positivo y específico de lo que ves
- Señala 1 o 2 cosas concretas que podría mejorar la próxima vez (presentación, color, decoración, elección del vaso, hielo, capas)
- Cierra con un consejo práctico y una frase motivadora
- Máximo 4 oraciones, tono cercano y alentador
- Si la imagen NO parece una bebida o un vaso, díselo con amabilidad y pídele que tome la foto de su bebida`
        : `Eres un chef evaluador amable y motivador. El usuario acaba de cocinar el plato "${course.strMeal}" (cocina ${course.strArea}, categoría ${course.strCategory}) siguiendo un curso paso a paso.

Mira la foto de su resultado y dale retroalimentación en español:
- Empieza con algo positivo y específico de lo que ves
- Señala 1 o 2 cosas concretas que podría mejorar la próxima vez (presentación, color, textura, punto de cocción)
- Cierra con un consejo práctico y una frase motivadora
- Máximo 4 oraciones, tono cercano y alentador
- Si la imagen NO parece un plato de comida, díselo con amabilidad y pídele que tome la foto de su platillo`);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    });

    await this.aiUsage.bumpDailyAiUsage(aiUser); // cuenta solo éxitos
    return { feedback: completion.choices[0].message.content ?? '' };
  }

  // Ayuda visual EN VIVO durante un paso (copiloto Fase 1): el usuario manda una foto de cómo
  // va y la IA (gpt-4o) responde con contexto del PASO ACTUAL ("¿voy bien?"). Distinto de
  // feedbackResult (que juzga el plato FINAL): aquí el tono es de acompañamiento, no de veredicto.
  // Misma llamada cara → cuenta contra el tope diario de IA.
  async stepHelp(
    userId: number,
    idMeal: string,
    numero: number,
    stepText: string,
    imageBase64: string,
    idioma: 'es' | 'en' = 'es',
  ) {
    const [aiUser, course] = await Promise.all([
      this.aiUsage.assertDailyAiLimit(userId),
      this.prisma.mealDbCourse.findUnique({ where: { idMeal } }),
    ]);
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (!imageBase64) throw new NotFoundException('Falta la imagen');

    // El paso lo manda el cliente; se recorta para no inflar el prompt ni dar pie a inyección.
    const paso = String(stepText ?? '').replace(/[{}[\]]/g, '').slice(0, 300);
    const esBebida = this.isDrink(idMeal);

    const prompt = idioma === 'en'
      ? `You are a warm ${esBebida ? 'bartender' : 'chef'} cooking ALONGSIDE the user, right now, in real time. They are on a step of the "${course.strMeal}" course and sent a photo of how it's going to check they're on track.

Current step: "${paso}"

Look at the photo and reply in English like a companion in the kitchen:
- Tell them if it looks on track for THIS step (not the final dish)
- If something looks off, give ONE clear, actionable fix they can do now
- If it looks good, reassure them and say what to watch for next
- Warm, brief, encouraging. Maximum 3 sentences. No lists.
- If the photo doesn't show food/cooking, kindly ask them to point the camera at what they're making`
      : `Eres un ${esBebida ? 'bartender' : 'chef'} cercano que cocina JUNTO al usuario, ahora mismo, en tiempo real. Está en un paso del curso "${course.strMeal}" y te mandó una foto de cómo va para confirmar que va bien.

Paso actual: "${paso}"

Mira la foto y responde en español como un compañero de cocina:
- Dile si va bien para ESTE paso (no el plato final)
- Si algo se ve mal, dale UNA corrección clara que pueda hacer ahora
- Si va bien, tranquilízalo y dile qué vigilar en lo que sigue
- Cercano, breve, alentador. Máximo 3 oraciones. Sin listas.
- Si la foto no muestra comida/cocina, pídele con amabilidad que apunte la cámara a lo que está preparando`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    });

    await this.aiUsage.bumpDailyAiUsage(aiUser); // cuenta solo éxitos
    return { feedback: completion.choices[0].message.content ?? '' };
  }

  async chatLesson(
    userId: number,
    idMeal: string,
    numero: number,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    const [user, course] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.mealDbCourse.findUnique({ where: { idMeal } }),
    ]);

    if (!course) throw new NotFoundException('Syllabus no generado aún');

    const lecciones = this.leccionesDe(course);
    const leccion = lecciones.find(l => l.numero === numero);
    if (!leccion) throw new NotFoundException('Lección no encontrada');

    const completados = await this.prisma.userMealDbCourse.findMany({
      where: { userId },
      include: { course: { select: { strMeal: true } } },
    });
    const cursosCompletados = completados.map(c => c.course.strMeal);

    const systemPrompt = `Eres un chef-educador que está enseñando la lección ${numero} de un curso de cocina.

Datos del usuario:
- Nivel: ${user?.nivel ?? 1} (del 1 al 100)
- Cursos completados previamente: ${cursosCompletados.join(', ') || 'ninguno'}

Datos del curso:
- Receta: ${course.strMeal}
- Origen: ${course.strArea}
- Categoría: ${course.strCategory}

Datos de esta lección:
- Título: ${leccion.titulo}
- Descripción: ${leccion.descripcion}
- Técnica a enseñar: ${leccion.tecnica}

Instrucciones de comportamiento:
- Adapta el nivel de explicación al nivel del usuario: nivel 1-10 explicaciones muy básicas, nivel 11-30 intermedias, nivel 31+ avanzadas
- Primero explica el concepto y la técnica de esta lección de forma clara
- Luego hazle entre 1 y 2 preguntas para verificar que entendió
- El usuario puede preguntarte lo que quiera sobre el tema
- Cuando consideres que el usuario dominó el tema de esta lección, responde con el texto exacto "LECCION_COMPLETADA" al final de tu mensaje para que el sistema habilite el botón de completar lección
- Responde siempre en español
- Sé amigable, motivador y conciso`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.8,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const reply = completion.choices[0].message.content ?? '';
    const leccionCompletada = reply.includes('LECCION_COMPLETADA');

    return { reply, leccionCompletada };
  }

  async completeLesson(userId: number, idMeal: string, numero: number) {
    // Ola 1 — lecturas independientes en paralelo (cada round-trip cuesta ~155ms):
    // ¿ya la completó? (XP solo la 1ª vez), plan (tope) y total de lecciones (tope FREE).
    const [yaCompletada, user, totalLessons] = await Promise.all([
      this.prisma.userMealDbLesson.findUnique({
        where: { userId_idMeal_numeroLeccion: { userId, idMeal, numeroLeccion: numero } },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
      this.prisma.userMealDbLesson.count({ where: { userId } }),
    ]);

    // Tope de lecciones por plan (FREE=3, de por vida, global). Solo cuenta lecciones NUEVAS.
    if (!yaCompletada) {
      const limit = limitsFor(user?.plan).lessons;
      if (limit !== Infinity && totalLessons >= limit) throw new ForbiddenException('LESSON_LIMIT_REACHED');
    }

    // Ola 2 — registrar la lección (las demás escrituras dependen de esto).
    await this.prisma.userMealDbLesson.upsert({
      where: { userId_idMeal_numeroLeccion: { userId, idMeal, numeroLeccion: numero } },
      create: { userId, idMeal, numeroLeccion: numero },
      update: { fechaCompletado: new Date() },
    });

    // Ola 3 — XP de la lección SOLO (mutaciones de XP del mismo usuario nunca en paralelo:
    // checkLessonMissions también puede otorgar XP y correría contra esta).
    if (!yaCompletada) await this.statsService.awardXp(userId, XP.LESSON);

    // Ola 4 — progreso del curso (lectura pura) en paralelo con las misiones de cursos.
    // trackMissionProgress va DESPUÉS aparte: si completa una misión de clan, rewardMission
    // también otorga XP personal → nunca concurrente con el XP de checkLessonMissions.
    const [lessonsDone] = await Promise.all([
      this.prisma.userMealDbLesson.count({ where: { userId, idMeal } }),
      this.checkLessonMissions(userId),
    ]);
    await this.clansService.trackMissionProgress(userId, 'completar_leccion');

    return { lessonsDone, courseComplete: lessonsDone >= 5 };
  }

  async completeCourse(userId: number, idMeal: string) {
    // Ola 1 — TODAS las lecturas del gate en paralelo (antes: 3 paralelas + 2 en serie).
    const [course, lessonsDone, existing, user, totalCourses] = await Promise.all([
      this.prisma.mealDbCourse.findUnique({ where: { idMeal } }),
      this.prisma.userMealDbLesson.count({ where: { userId, idMeal } }),
      this.prisma.userMealDbCourse.findUnique({ where: { userId_idMeal: { userId, idMeal } } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
      this.prisma.userMealDbCourse.count({ where: { userId } }),
    ]);
    if (!course) throw new NotFoundException('Curso no encontrado');
    if (lessonsDone < 5) throw new ForbiddenException('Debes completar todas las lecciones primero');
    if (existing) return { alreadyCompleted: true, xpGanado: existing.xpGanado };

    // Tope de cursos completos por plan (PRO=3, FREE=0, de por vida, global). CHEF ilimitado.
    const limit = limitsFor(user?.plan).courses;
    if (limit !== Infinity && totalCourses >= limit) throw new ForbiddenException('COURSE_LIMIT_REACHED');

    const xpGanado = XP.COURSE_BASE + course.nivelMinimo * XP.COURSE_PER_LEVEL;

    await this.prisma.userMealDbCourse.create({ data: { userId, idMeal, xpGanado } });

    // XP del usuario en serie (stats del curso → misiones): nunca dos awardXp concurrentes
    // sobre la misma fila. Las insignias se verifican DESPUÉS de todo el XP (nivel correcto).
    const statsResult = await this.statsService.actualizarStatsPostCurso(
      userId,
      { strArea: course.strArea, strCategory: course.strCategory, lecciones: this.leccionesDe(course) },
      xpGanado,
    );
    await this.checkCourseMissions(userId, course);

    // Cierres independientes entre sí: insignias (lee stats ya actualizadas) y clan
    // (XP colectivo + misiones de clan — tablas de clan, no tocan User.xpTotal).
    const [nuevasInsignias] = await Promise.all([
      this.badgesService.verificarInsignias(userId),
      this.clansService.addXp(userId, xpGanado),
      this.clansService.trackMissionProgress(userId, 'completar_curso'),
    ]);

    return { ...statsResult, nuevasInsignias };
  }

  async getMyCourses(userId: number) {
    const completed = await this.prisma.userMealDbCourse.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { fechaCompletado: 'desc' },
    });
    return completed.map(c => ({
      idMeal: c.idMeal,
      strMeal: c.course.strMeal,
      strArea: c.course.strArea,
      strCategory: c.course.strCategory,
      thumbnailUrl: c.course.thumbnailUrl,
      nivelMinimo: c.course.nivelMinimo,
      xpGanado: c.xpGanado,
      fechaCompletado: c.fechaCompletado,
    }));
  }

  async getCourseProgress(userId: number, idMeal: string) {
    const done = await this.prisma.userMealDbLesson.findMany({
      where: { userId, idMeal },
      orderBy: { numeroLeccion: 'asc' },
    });
    const doneNums = new Set(done.map(l => l.numeroLeccion));
    const proximaLeccion = [1, 2, 3, 4, 5].find(n => !doneNums.has(n)) ?? null;
    return { leccionesCompletadas: done.length, proximaLeccion, leccionesIds: [...doneNums] };
  }

  async getStats(userId: number) {
    return this.statsService.getStats(userId);
  }

  async getBadges(userId: number) {
    return this.badgesService.getUserBadges(userId);
  }

  /* ── Roadmap POR CATEGORÍA (recetas de la categoría + habilidades intercaladas) ── */

  // Lista ORDENADA de nodos de una categoría: sus recetas (capadas) con las habilidades
  // curadas intercaladas por `pos` (skill.pos = tras cuántas recetas va).
  private async buildCategoryNodes(category: string) {
    const def = CATEGORY_ROADMAP[category];
    const color = def?.color ?? '#F97316';
    const recipes = (await this.fetchCategoryMeals(category)).slice(0, RECIPES_PER_CATEGORY);
    const skills = def?.skills ?? [];

    type Node = { id: string; type: 'recipe' | 'skill'; title: string; desc: string; thumbnailUrl?: string };
    const nodes: Node[] = [];
    for (let i = 0; i <= recipes.length; i++) {
      for (const sk of skills.filter(s => s.pos === i)) {
        nodes.push({ id: skillIdOf(sk.key), type: 'skill', title: sk.title, desc: sk.desc });
      }
      if (i < recipes.length) {
        const r = recipes[i];
        nodes.push({ id: r.idMeal, type: 'recipe', title: r.strMeal, desc: '', thumbnailUrl: r.strMealThumb });
      }
    }
    return { color, nodes };
  }

  // Roadmap de una categoría: estado por nodo (completed/current/locked secuencial) + cuota.
  async getCategoryRoadmap(userId: number, category: string) {
    const { color, nodes: ordered } = await this.buildCategoryNodes(category);
    const idMeals = ordered.map(n => n.id);

    const [user, completed, lessonsDone, coursesDone] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
      this.prisma.userMealDbCourse.findMany({ where: { userId, idMeal: { in: idMeals } }, select: { idMeal: true } }),
      this.prisma.userMealDbLesson.count({ where: { userId } }),
      this.prisma.userMealDbCourse.count({ where: { userId } }),
    ]);
    const plan = user?.plan ?? 'FREE';
    const doneSet = new Set(completed.map(c => c.idMeal));
    const limits = limitsFor(plan);

    let frontierTaken = false; // el 1er nodo no completado es el "current"/frontera
    const finalIdx = ordered.length - 1;
    const nodes = ordered.map((n, idx) => {
      const done = doneSet.has(n.id);
      let state: 'completed' | 'current' | 'locked';
      if (done) state = 'completed';
      else if (!frontierTaken) { frontierTaken = true; state = 'current'; }
      else state = 'locked';
      return {
        key: n.id,                       // ruta de juego (idMeal / d_ / path_)
        type: n.type,
        title: n.title,
        desc: n.desc,
        thumbnailUrl: n.thumbnailUrl ?? null,
        color,
        xp: n.type === 'skill' ? 40 : 50,
        lessons: 5,
        final: idx === finalIdx,
        state,
      };
    });

    return {
      category,
      color,
      nodes,
      quota: {
        plan,
        lessonsDone,
        lessonLimit: limits.lessons === Infinity ? null : limits.lessons,   // null = ilimitado
        coursesDone,
        courseLimit: limits.courses === Infinity ? null : limits.courses,
      },
    };
  }

  // Lunes 00:00 UTC de la semana actual — las misiones son semanales, así que el
  // progreso se cuenta sobre lo completado ESTA semana (no el total histórico).
  private weekStartUTC(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  }

  private async checkLessonMissions(userId: number) {
    const userMissions = await this.prisma.userMission.findMany({
      where: { userId, completada: false, expirada: false },
      include: { mission: true },
    });
    const lessonMissions = userMissions.filter(um => (um.mission.condicion as any)?.tipo === 'completar_leccion');
    if (lessonMissions.length === 0) return;

    // El count es el MISMO para todas las misiones de lección → una sola query
    // (antes se repetía idéntica dentro del loop = N round-trips).
    const done = await this.prisma.userMealDbLesson.count({
      where: { userId, fechaCompletado: { gte: this.weekStartUTC() } },
    });

    for (const um of lessonMissions) {
      const cond = um.mission.condicion as any;
      if (done >= (cond.cantidad ?? 1)) {
        await this.prisma.userMission.update({
          where: { id: um.id },
          data: { completada: true, completadaEn: new Date() },
        });
        // XP por la función central (recalcula nivel + cookingLevel). Secuencial a propósito:
        // varios awardXp concurrentes sobre el mismo user hacen race en el recálculo de nivel.
        await this.statsService.awardXp(userId, um.mission.xpRecompensa);
      }
    }
  }

  private async checkCourseMissions(userId: number, course: any) {
    const userMissions = await this.prisma.userMission.findMany({
      where: { userId, completada: false, expirada: false },
      include: { mission: true },
    });
    const weekStart = this.weekStartUTC();

    // Los counts son LECTURAS independientes (distinto where por condición) → en paralelo.
    // Las completadas se resuelven después en serie (awardXp del mismo user nunca concurrente).
    const evaluated = await Promise.all(userMissions.map(async (um) => {
      const cond = um.mission.condicion as any;
      let shouldComplete = false;

      if (cond.tipo === 'completar_curso') {
        const done = await this.prisma.userMealDbCourse.count({
          where: { userId, fechaCompletado: { gte: weekStart } },
        });
        shouldComplete = done >= (cond.cantidad ?? 1);
      } else if (cond.tipo === 'completar_curso_categoria' && cond.categoria === course.strCategory) {
        const done = await this.prisma.userMealDbCourse.count({
          where: { userId, fechaCompletado: { gte: weekStart }, course: { strCategory: cond.categoria } },
        });
        shouldComplete = done >= (cond.cantidad ?? 1);
      } else if (cond.tipo === 'completar_curso_area' && cond.area === course.strArea) {
        const done = await this.prisma.userMealDbCourse.count({
          where: { userId, fechaCompletado: { gte: weekStart }, course: { strArea: cond.area } },
        });
        shouldComplete = done >= (cond.cantidad ?? 1);
      }

      return { um, shouldComplete };
    }));

    for (const { um, shouldComplete } of evaluated) {
      if (!shouldComplete) continue;
      await this.prisma.userMission.update({
        where: { id: um.id },
        data: { completada: true, completadaEn: new Date() },
      });
      await this.statsService.awardXp(userId, um.mission.xpRecompensa);
    }
  }
}
