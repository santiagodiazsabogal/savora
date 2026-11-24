import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

// Preferencias del sheet "Personaliza tu semana" del Planificador.
// Se aplican ENCIMA del perfil (dieta/alergias/nivel/tiempo ya van por buildProfileContext).
export interface MenuPreferences {
  focus?: string                // varied | healthy | budget | quick ('protein' legado → nutritionGoals)
  cuisines?: string[]           // italian | mexican | asian | mediterranean | homestyle | american
  maxCookTime?: number | null   // minutos máximos por receta
  includeIngredients?: string   // texto libre: ingredientes a incluir
  avoidIngredients?: string     // texto libre: ingredientes a evitar
  budget?: string               // economic | normal
  calorieGoal?: string | null   // light | balanced | hearty (kcal por porción)
  nutritionGoals?: string[]     // protein | low_carb | low_fat | low_sodium (componibles)
  servings?: number | null      // para cuántos cocina (1 | 2 | 4)
}

// Rangos de kcal POR PORCIÓN de cada meta del planificador (compartidos entre el
// prompt del menú semanal y el hint del "Prepare" en recipes.service).
export const CALORIE_GOAL_RANGES: Record<string, string> = {
  light: 'under 450',
  balanced: 'between 450 and 650',
  hearty: 'at least 650',
}

export const NUTRITION_GOAL_LABELS: Record<string, string> = {
  protein: 'high in protein',
  low_carb: 'low in carbohydrates',
  low_fat: 'low in fat',
  low_sodium: 'low in sodium',
}

@Injectable()
export class OpenaiService {

  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private sanitizeInput(input: string): string {
    return input.trim().slice(0, 500)
      .replace(/<[^>]*>/g, '')
      .replace(/[{}[\]]/g, '')
      .replace(/ignore previous|forget|system prompt|jailbreak/gi, '')
  }

  private buildProfileContext(user: any): string {
    return `
User profile:
- Cooking level: ${user?.cookingLevel ?? 'beginner'}
- Diet type: ${user?.dietType ?? 'omnivore'}
- Allergies: ${user?.allergies ?? 'none'}
- Goal: ${user?.goal ?? 'eat_healthy'}
Respect allergies and diet always. Match cooking level.`.trim();
  }

  // Nutrición por porción: valida los números que devuelve el modelo y los consolida en
  // { servings, calories, protein, carbs, fat, vitaminC, calcium, iron, sodium }.
  // Devuelve null si calories no es un número positivo (sin dato fiable, mejor no mostrar
  // nada que mostrar basura). Los micros (mg) son opcionales: null si el modelo no los dio
  // (el frontend oculta esa fila).
  normalizeNutrition(rawNutrition: any, rawServings: any): {
    servings: number; calories: number; protein: number; carbs: number; fat: number;
    vitaminC: number | null; calcium: number | null; iron: number | null; sodium: number | null;
  } | null {
    const num = (v: unknown): number | null => {
      const n = typeof v === 'string' ? parseFloat(v) : v
      return typeof n === 'number' && isFinite(n) && n >= 0 ? n : null
    }
    const calories = num(rawNutrition?.calories)
    if (calories === null || calories === 0) return null
    const servingsNum = num(rawServings)
    // 1 decimal: dosis pequeñas como el hierro (2.5mg) perderían todo con Math.round
    const mg = (v: unknown): number | null => {
      const n = num(v)
      return n === null ? null : Math.round(n * 10) / 10
    }
    return {
      servings: Math.min(12, Math.max(1, Math.round(servingsNum || 1))),
      calories: Math.round(calories),
      protein: Math.round(num(rawNutrition?.protein) ?? 0),
      carbs: Math.round(num(rawNutrition?.carbs) ?? 0),
      fat: Math.round(num(rawNutrition?.fat) ?? 0),
      vitaminC: mg(rawNutrition?.vitaminC),
      calcium: mg(rawNutrition?.calcium),
      iron: mg(rawNutrition?.iron),
      sodium: mg(rawNutrition?.sodium),
    }
  }

  private normalizeCookTime(raw: any): number {
    if (typeof raw === 'number' && !isNaN(raw)) return Math.round(raw);
    if (typeof raw === 'string') {
      const match = raw.match(/\d+/);
      if (match) return parseInt(match[0], 10);
    }
    return 30;
  }

  async isCookingRelated(message: string): Promise<boolean> {
    const safe = message.trim().slice(0, 200)
    if (safe.length < 3) return false
    if (!safe.toLowerCase().split(/\s+/).some(w => /[aeiouáéíóú]/i.test(w))) return false
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 5, temperature: 0,
        messages: [
          { role: 'system', content: 'Reply ONLY with "yes" or "no".' },
          { role: 'user', content: `Is this about food or cooking? "${safe}"` },
        ],
      })
      return (completion.choices?.[0]?.message?.content?.toLowerCase().trim() ?? 'no').startsWith('yes')
    } catch { return true }
  }

  // Clasificador barato para el buscador del mercado: ¿es un ítem de comida/despensa
  // comprable en un súper (ingrediente, snack, bebida...)? Kroger vende de TODO (ropa,
  // electrónica) — sin esto, buscar "shoes" devolvía zapatos reales. Se llama con caché
  // en MarketService (mismo término = misma respuesta) para no gastar tokens por tecla.
  // Fail-open (igual que isCookingRelated): un fallo de la API nunca bloquea la búsqueda.
  async isFoodItem(term: string): Promise<boolean> {
    const safe = term.trim().slice(0, 60)
    if (safe.length < 2) return false
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 5, temperature: 0,
        messages: [
          { role: 'system', content: 'Reply ONLY with "yes" or "no".' },
          { role: 'user', content: `Is "${safe}" a food, drink, or grocery/pantry item you'd buy at a supermarket?` },
        ],
      })
      return (completion.choices?.[0]?.message?.content?.toLowerCase().trim() ?? 'no').startsWith('yes')
    } catch { return true }
  }

  // Etiquetas legibles por categoría, usadas por matchesMealCategory para el prompt
  // del clasificador y reutilizables si hace falta mostrar el nombre de la sección.
  private static readonly MEAL_CATEGORY_LABELS: Record<string, string> = {
    breakfast: 'breakfast (morning food)',
    lunch: 'lunch (a lighter midday main dish)',
    dinner: 'dinner (a heartier evening main dish)',
    snack: 'a snack / small bite',
    dessert: 'a dessert (sweet dish)',
    drink: 'a non-alcoholic drink',
    cocktail: 'a cocktail (alcoholic mixed drink)',
  }

  // Tags mecánicos que el frontend añade siempre al mensaje ((meal type: X),
  // (available time: X), (use these ingredients: ...), (seed: X)). Si se dejan dentro
  // del texto evaluado por los clasificadores, la sola presencia de la palabra "meal"
  // hace que un texto random ("asdasd (meal type: lunch)") parezca "sobre comida" y
  // pase el filtro. Los quitamos para clasificar SOLO lo que escribió el usuario.
  private static readonly META_TAG_REGEX =
    /\((?:meal type|available time|use these ingredients|seed):[^)]*\)/gi

  private stripMetaTags(message: string): string {
    return message.replace(OpenaiService.META_TAG_REGEX, '').replace(/\s+/g, ' ').trim()
  }

  // Valida un pedido de receta antes de generarla: rechaza texto que no sea sobre
  // comida (NOT_FOOD_RELATED) y texto que no encaje con la sección elegida
  // (MEAL_TYPE_MISMATCH). Se evalúa solo la parte escrita por el usuario (ver
  // stripMetaTags) para que los tags mecánicos no "disfracen" un texto inválido.
  async assertValidRecipeRequest(message: string, mealType: string | null): Promise<void> {
    const query = this.stripMetaTags(message)
    const isValid = await this.isCookingRelated(query)
    if (!isValid) throw new BadRequestException('NOT_FOOD_RELATED')

    const fitsCategory = await this.matchesMealCategory(query, mealType)
    if (!fitsCategory) throw new BadRequestException('MEAL_TYPE_MISMATCH')
  }

  // ¿El pedido del usuario encaja con la sección elegida (desayuno/almuerzo/postre/...)?
  // Sin esto, pedir "un almuerzo" estando en la sección de Postres generaba igual una
  // receta (el prompt solo la orientaba, no la exigía) sin avisar al usuario del desajuste.
  // Fail-open ante error de la API (nunca bloquea por un fallo de red/clasificador).
  async matchesMealCategory(message: string, mealType: string | null): Promise<boolean> {
    if (!mealType || mealType === 'surprise') return true
    const label = OpenaiService.MEAL_CATEGORY_LABELS[mealType]
    if (!label) return true
    const safe = message.trim().slice(0, 200)
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 5, temperature: 0,
        messages: [
          { role: 'system', content: 'Reply ONLY with "yes" or "no".' },
          {
            role: 'user',
            content: `The user is in the "${label}" section of a recipe app and typed: "${safe}". ` +
              `Reply "yes" if this could reasonably be made as ${label} (or is generic/ambiguous). ` +
              `Reply "no" ONLY if it clearly asks for a dish from a different category ` +
              `(e.g. asking for a full savory lunch/dinner while in the dessert section, or a dessert while in the lunch/dinner section).`,
          },
        ],
      })
      return (completion.choices?.[0]?.message?.content?.toLowerCase().trim() ?? 'yes').startsWith('yes')
    } catch { return true }
  }

  // Variante para el CHAT DEL CHEF: hay una conversación anclada a una receta, así
  // que los follow-ups cortos NO se bloquean. Solo rechaza temas claramente ajenos
  // (código, matemáticas, política, tareas, conocimiento general, etc.).
  async isChatCookingRelated(message: string, recipeTitle: string): Promise<boolean> {
    const safe = message.trim().slice(0, 200)
    if (safe.length < 2) return true // follow-up muy corto → permitir (hay contexto)
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 5, temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You moderate a chat where a user talks to a chef about a specific recipe. Answer YES if the message is about food, cooking, the kitchen, ingredients, techniques, substitutions, timing, servings, or is a follow-up/clarification of the cooking conversation. Answer NO only if it is clearly off-topic (programming, math, politics, general knowledge, essays, homework, or jokes unrelated to food). Reply ONLY with "yes" or "no".',
          },
          { role: 'user', content: `Recipe being discussed: "${recipeTitle}". Message: "${safe}". Is it part of the cooking chat?` },
        ],
      })
      return (completion.choices?.[0]?.message?.content?.toLowerCase().trim() ?? 'yes').startsWith('yes')
    } catch { return true } // ante error de la API, no bloquear el chat
  }

  // Moderación de texto (chat de clanes): bloquea acoso/insultos/contenido ofensivo.
  // Usa la API de moderación de OpenAI con umbrales propios más estrictos para un chat social.
  async moderateText(text: string): Promise<{ flagged: boolean; categories: string[] }> {
    const safe = (text ?? '').trim()
    if (!safe) return { flagged: false, categories: [] }
    try {
      const res = await this.openai.moderations.create({
        model: 'omni-moderation-latest',
        input: safe.slice(0, 2000),
      })
      const result: any = res.results?.[0]
      if (!result) return { flagged: false, categories: [] }

      const THRESHOLDS: Record<string, number> = {
        harassment: 0.5,
        'harassment/threatening': 0.4,
        hate: 0.4,
        'hate/threatening': 0.3,
        sexual: 0.6,
        'sexual/minors': 0.2,
        violence: 0.7,
        'violence/graphic': 0.7,
        'self-harm': 0.5,
        'self-harm/intent': 0.5,
        'self-harm/instructions': 0.5,
      }
      const scores: Record<string, number> = result.category_scores ?? {}
      const flaggedCats: string[] = []
      for (const [cat, score] of Object.entries(scores)) {
        const limit = THRESHOLDS[cat]
        if (limit !== undefined && typeof score === 'number' && score >= limit) {
          flaggedCats.push(cat)
        }
      }
      const flagged = result.flagged === true || flaggedCats.length > 0
      return { flagged, categories: flagged ? (flaggedCats.length ? flaggedCats : ['flagged']) : [] }
    } catch {
      // Fail-open: si la moderación falla (red/API caída), no rompemos el chat.
      return { flagged: false, categories: [] }
    }
  }

  // Moderación de IMAGEN (fotos del chat de clanes): "solo seguridad" — bloquea
  // contenido sexual/NSFW, violencia gráfica y autolesiones usando el modelo
  // multimodal de moderación de OpenAI. NO exige que la foto sea culinaria.
  // Umbrales conservadores para una app de cocina: el de violencia gráfica va MUY
  // alto para no marcar carne cruda / sangre de cocina como falso positivo.
  async moderateImage(imageUrl: string): Promise<{ flagged: boolean; categories: string[] }> {
    const url = (imageUrl ?? '').trim()
    if (!url) return { flagged: false, categories: [] }
    try {
      const res = await this.openai.moderations.create({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url } }],
      })
      const result: any = res.results?.[0]
      if (!result) return { flagged: false, categories: [] }

      // Solo categorías relevantes para imágenes; las de texto (hate/harassment) se omiten
      // porque sobre fotos son poco fiables. No usamos result.flagged directo para evitar
      // que el modelo marque platos de carne cruda como "violence/graphic".
      const THRESHOLDS: Record<string, number> = {
        sexual: 0.6,
        'sexual/minors': 0.3,
        'violence/graphic': 0.9,
        'self-harm': 0.6,
        'self-harm/intent': 0.6,
        'self-harm/instructions': 0.6,
      }
      const scores: Record<string, number> = result.category_scores ?? {}
      const flaggedCats: string[] = []
      for (const [cat, score] of Object.entries(scores)) {
        const limit = THRESHOLDS[cat]
        if (limit !== undefined && typeof score === 'number' && score >= limit) {
          flaggedCats.push(cat)
        }
      }
      return { flagged: flaggedCats.length > 0, categories: flaggedCats }
    } catch {
      // Fail-open: si la moderación falla, no bloqueamos el envío.
      return { flagged: false, categories: [] }
    }
  }

  // =========================
  // 💡 GENERAR SUGERENCIAS
  // =========================
  // Estilos cotidianos y familiares para variar las sugerencias SIN forzar fusiones raras
  // ni ingredientes difíciles de conseguir. La idea: platos simples y conocidos.
  private readonly EVERYDAY_STYLES = [
    'home-style comfort food', 'quick & healthy', 'classic Italian',
    'Mexican home cooking', 'simple Mediterranean', 'American comfort',
    'easy Asian-inspired', 'fresh & light', 'hearty and filling',
  ]

  async generarSugerencias(
    user: any, mealType: string | null, language: 'en' | 'es' = 'en',
    recentTitles: string[] = [], _favoriteTitles: string[] = [],
  ): Promise<{ title: string; description: string; missingIngredients: string[] }[]> {

    const profileCtx = this.buildProfileContext(user)

    // El tipo de comida cambia la NATURALEZA de la sugerencia: un cóctel/bebida/postre NO es
    // un "plato". Sin esto, el prompt (centrado en comida) devolvía pasta/tacos aunque pidieras
    // "Cocktail". `kindLine` define qué sugerir y `examples` da ejemplos del tipo correcto.
    let kindLine: string
    let examples: string
    switch (mealType) {
      case 'cocktail':
        kindLine = 'Suggest exactly 4 DIFFERENT popular COCKTAILS (alcoholic mixed drinks).'
        examples = 'mojito, margarita, piña colada, daiquiri, gin and tonic, negroni, cuba libre'
        break
      case 'drink':
        kindLine = 'Suggest exactly 4 DIFFERENT popular DRINKS (non-alcoholic beverages).'
        examples = 'smoothie, lemonade, iced tea, fresh fruit juice, milkshake, hot chocolate'
        break
      case 'dessert':
        kindLine = 'Suggest exactly 4 DIFFERENT popular DESSERTS.'
        examples = 'chocolate chip cookies, brownies, cheesecake, fruit salad, rice pudding, banana bread'
        break
      case 'snack':
        kindLine = 'Suggest exactly 4 DIFFERENT easy SNACKS / small bites.'
        examples = 'guacamole, hummus, nachos, popcorn, cheese toast, fruit bowl'
        break
      case 'breakfast':
        kindLine = 'Suggest exactly 4 DIFFERENT popular BREAKFAST dishes (morning food).'
        examples = 'pancakes, scrambled eggs, omelette, oatmeal, French toast, yogurt bowl, avocado toast, breakfast burrito'
        break
      case 'lunch':
        kindLine = 'Suggest exactly 4 DIFFERENT everyday LUNCH dishes (lighter midday mains).'
        examples = 'salads, sandwiches, wraps, rice bowls, pasta, soups, grain bowls, quesadillas'
        break
      case 'dinner':
        kindLine = 'Suggest exactly 4 DIFFERENT everyday DINNER dishes (satisfying evening mains).'
        examples = 'grilled chicken, beef tacos, stir-fries, baked fish, pasta, roasted veggies with protein, curry'
        break
      default:
        kindLine = 'Suggest exactly 4 DIFFERENT everyday DISHES that are SIMPLE, POPULAR and easy to make at home.'
        examples = 'pasta, rice bowls, omelettes, grilled chicken, salads, sandwiches, soups, tacos, stir-fries'
    }
    const mealCtx = mealType && mealType !== 'surprise' ? `They must all be ${mealType} options.` : ''

    // Un solo estilo cotidiano al azar para dar variedad sin forzar fusiones exóticas.
    const styleHint = this.EVERYDAY_STYLES[Math.floor(Math.random() * this.EVERYDAY_STYLES.length)]

    const excludeNote = recentTitles.length > 0
      ? `NEVER suggest any of these (already seen): ${recentTitles.map(t => `"${t}"`).join(', ')}.\n` : ''
    const langInstruction = language === 'es' ? 'Reply in SPANISH.' : 'Reply in ENGLISH.'

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 500, temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a friendly home cook and bartender. ${kindLine} They must be easy to make at home.
Style for today: ${styleHint}. ${mealCtx} ${langInstruction}
STRICT RULES:
- Familiar, well-known options most people recognize and would actually make (e.g. ${examples}).
- Stay strictly within the requested type: if the type is cocktails or drinks, suggest ONLY beverages (never food dishes); if dessert, only desserts.
- ONLY common, easy-to-find ingredients. NO exotic or hard-to-source items, NO fancy fusion combos, NO over-elaborate restaurant-style names.
- Quick and approachable for a normal home kitchen.
- Each must be a DIFFERENT item with a SHORT, clear name (not a long elaborate title).
- For each, also list its "missingIngredients": the 3-6 KEY grocery items needed to make it,
  as GENERIC names only (e.g. "chicken", "rice", "soy sauce") — NO quantities, NO units, NO
  preparation words. Skip staples everyone has (salt, pepper, water). These are what the user
  would buy at the store, so keep them short and shoppable.
${excludeNote}${profileCtx}
Reply ONLY with valid JSON: {"suggestions":[{"title":"short name","description":"one short appetizing line","missingIngredients":["item","item"]},...]}`
          },
          { role: 'user', content: `Give me 4 simple, everyday recipe ideas. Seed: ${Math.random().toString(36).slice(2)}` },
        ],
      })

      const content = completion.choices?.[0]?.message?.content
      if (!content) return this.fallbackSuggestions(language, mealType)
      let result: any
      try { result = JSON.parse(content) } catch { return this.fallbackSuggestions(language, mealType) }
      if (!Array.isArray(result.suggestions)) return this.fallbackSuggestions(language, mealType)
      return result.suggestions.slice(0, 4).map((s: any) => ({
        title: String(s.title ?? ''), description: String(s.description ?? ''),
        missingIngredients: Array.isArray(s.missingIngredients)
          ? s.missingIngredients.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 8)
          : [],
      })).filter((s: any) => s.title.length > 0)
    } catch { return this.fallbackSuggestions(language, mealType) }
  }

  private fallbackSuggestions(language: 'en' | 'es', mealType: string | null) {
    // Fallbacks POR CATEGORÍA: si la IA falla y piden cóctel/bebida/postre, no devolver comida.
    const food = {
      en: [
        { title: 'Garlic pasta', description: 'Classic Italian with garlic and olive oil' },
        { title: 'Grilled chicken', description: 'Juicy and seasoned with herbs' },
        { title: 'Greek salad', description: 'Fresh, light and Mediterranean' },
        { title: "Chef's omelette", description: 'Fluffy with cheese and herbs' },
        { title: 'Veggie stir-fry', description: 'Colorful vegetables with soy sauce' },
        { title: 'Tomato soup', description: 'Creamy and comforting homemade soup' },
        { title: 'Beef tacos', description: 'Seasoned beef with fresh toppings' },
        { title: 'Caprese salad', description: 'Mozzarella, tomato and fresh basil' },
      ],
      es: [
        { title: 'Pasta al ajillo', description: 'Clásico italiano con ajo y aceite de oliva' },
        { title: 'Pollo a la plancha', description: 'Jugoso y marinado con hierbas' },
        { title: 'Ensalada griega', description: 'Fresca, ligera y mediterránea' },
        { title: 'Tortilla española', description: 'Cremosa por dentro y dorada por fuera' },
        { title: 'Arroz con verduras', description: 'Arroz salteado con vegetales frescos' },
        { title: 'Sopa de tomate', description: 'Cremosa y reconfortante, hecha en casa' },
        { title: 'Tacos de res', description: 'Carne sazonada con toppings frescos' },
        { title: 'Ensalada caprese', description: 'Mozzarella, tomate y albahaca fresca' },
      ],
    }
    const cocktail = {
      en: [
        { title: 'Mojito', description: 'Rum, lime, mint and soda' },
        { title: 'Margarita', description: 'Tequila, lime and orange liqueur' },
        { title: 'Piña colada', description: 'Rum, pineapple and coconut cream' },
        { title: 'Daiquiri', description: 'Rum, lime and a touch of sugar' },
        { title: 'Cuba libre', description: 'Rum, cola and a squeeze of lime' },
        { title: 'Gin and tonic', description: 'Gin, tonic water and lime' },
      ],
      es: [
        { title: 'Mojito', description: 'Ron, lima, menta y soda' },
        { title: 'Margarita', description: 'Tequila, lima y licor de naranja' },
        { title: 'Piña colada', description: 'Ron, piña y crema de coco' },
        { title: 'Daiquiri', description: 'Ron, lima y un toque de azúcar' },
        { title: 'Cuba libre', description: 'Ron, cola y un chorrito de lima' },
        { title: 'Gin tonic', description: 'Ginebra, tónica y lima' },
      ],
    }
    const drink = {
      en: [
        { title: 'Strawberry smoothie', description: 'Creamy blend of strawberries and yogurt' },
        { title: 'Lemonade', description: 'Fresh, sweet and tangy' },
        { title: 'Iced tea', description: 'Chilled black tea with lemon' },
        { title: 'Orange juice', description: 'Freshly squeezed and refreshing' },
        { title: 'Chocolate milkshake', description: 'Thick, cold and chocolatey' },
        { title: 'Hot chocolate', description: 'Warm and comforting cocoa' },
      ],
      es: [
        { title: 'Batido de fresa', description: 'Cremoso, con fresas y yogur' },
        { title: 'Limonada', description: 'Fresca, dulce y cítrica' },
        { title: 'Té helado', description: 'Té negro frío con limón' },
        { title: 'Jugo de naranja', description: 'Recién exprimido y refrescante' },
        { title: 'Malteada de chocolate', description: 'Espesa, fría y chocolatosa' },
        { title: 'Chocolate caliente', description: 'Cacao caliente y reconfortante' },
      ],
    }
    const dessert = {
      en: [
        { title: 'Chocolate chip cookies', description: 'Soft, buttery and chocolatey' },
        { title: 'Brownies', description: 'Rich and fudgy chocolate squares' },
        { title: 'Pancakes', description: 'Fluffy stack with maple syrup' },
        { title: 'Fruit salad', description: 'Fresh seasonal fruit, light and sweet' },
        { title: 'Rice pudding', description: 'Creamy with cinnamon' },
        { title: 'Banana bread', description: 'Moist and naturally sweet' },
      ],
      es: [
        { title: 'Galletas con chips de chocolate', description: 'Suaves, mantecosas y chocolatosas' },
        { title: 'Brownies', description: 'Cuadritos de chocolate densos' },
        { title: 'Panqueques', description: 'Esponjosos con miel de maple' },
        { title: 'Ensalada de frutas', description: 'Fruta fresca, ligera y dulce' },
        { title: 'Arroz con leche', description: 'Cremoso y con canela' },
        { title: 'Pan de plátano', description: 'Húmedo y dulce natural' },
      ],
    }
    const breakfast = {
      en: [
        { title: 'Scrambled eggs', description: 'Soft, fluffy eggs with butter' },
        { title: 'Pancakes', description: 'Fluffy stack with maple syrup' },
        { title: 'Oatmeal bowl', description: 'Warm oats with fruit and honey' },
        { title: 'Avocado toast', description: 'Crispy bread with fresh avocado' },
        { title: 'French toast', description: 'Golden, sweet and cinnamon-spiced' },
        { title: 'Yogurt parfait', description: 'Yogurt layered with fruit and granola' },
      ],
      es: [
        { title: 'Huevos revueltos', description: 'Suaves y esponjosos con mantequilla' },
        { title: 'Panqueques', description: 'Esponjosos con miel de maple' },
        { title: 'Avena', description: 'Avena tibia con fruta y miel' },
        { title: 'Tostada de aguacate', description: 'Pan crujiente con aguacate fresco' },
        { title: 'Tostadas francesas', description: 'Doradas, dulces y con canela' },
        { title: 'Parfait de yogur', description: 'Yogur con fruta y granola' },
      ],
    }
    const byKind: Record<string, typeof food> = { cocktail, drink, dessert, breakfast, food }
    const key = mealType && byKind[mealType] ? mealType : 'food'
    const byLang = byKind[key]
    const list = byLang[language] ?? byLang.es
    const shuffled = [...list].sort(() => Math.random() - 0.5)
    // Los fallbacks (IA caída) no traen ingredientes clave → [] (el sheet de mercado no
    // aparece y el usuario genera directo; aceptable para el caso degradado).
    return shuffled.slice(0, 4).map(s => ({ ...s, missingIngredients: [] as string[] }))
  }

  // =========================
  // 🗓️ MENÚ SEMANAL (Planificador, PRO/CHEF)
  // Una sola llamada barata: devuelve 7 días × franjas pedidas con título +
  // descripción + dificultad + tiempo. NO genera recetas completas (eso ocurre
  // bajo demanda al "Preparar"). Personalizado: respeta perfil/dieta/alergias.
  // =========================
  async generarMenuSemanal(
    user: any, meals: string[], language: 'en' | 'es' = 'en', recentTitles: string[] = [],
    preferences: MenuPreferences = {},
  ): Promise<Record<string, { title: string; description: string; difficulty: string; cookTime: number }>[]> {
    const safeMeals = meals.filter(m => ['breakfast', 'lunch', 'dinner'].includes(m))
    const mealList = safeMeals.length > 0 ? safeMeals : ['breakfast', 'lunch', 'dinner']

    // Generación en PARALELO: una llamada por franja (cada una crea los 7 platos
    // distintos de esa franja). Antes era UNA sola llamada que generaba las 21
    // recetas en serie (~24s); ahora la latencia ≈ la franja más lenta (~3x más
    // rápido) y cada llamada es más corta (menos tokens → responde antes).
    const perMeal = await Promise.all(
      mealList.map(meal => this.generarFranjaSemana(meal, user, language, recentTitles, preferences)),
    )

    // Ensamblar a la estructura de 7 días que espera recipes.service.
    return Array.from({ length: 7 }, (_, i) => {
      const dia: Record<string, { title: string; description: string; difficulty: string; cookTime: number }> = {}
      mealList.forEach((meal, mIdx) => {
        dia[meal] = perMeal[mIdx][i] ?? { title: '', description: '', difficulty: 'easy', cookTime: 20 }
      })
      return dia
    })
  }

  // Bloque "USER MENU PREFERENCES" del sheet (compartido por todas las franjas).
  private buildMenuPrefsContext(preferences: MenuPreferences): string {
    const FOCUS_MAP: Record<string, string> = {
      varied: 'a varied, balanced week with diverse dishes',
      healthy: 'healthy, nutritious and light meals',
      budget: 'cheap, budget-friendly meals',
      protein: 'high-protein meals',
      quick: 'quick and easy meals with minimal prep',
    }
    const prefLines: string[] = []
    if (preferences.focus && FOCUS_MAP[preferences.focus]) prefLines.push(`- Weekly focus: ${FOCUS_MAP[preferences.focus]}.`)
    if (preferences.cuisines?.length) {
      // NOTA: el campo se llama `cuisines` por compatibilidad, pero ahora son estilos
      // de preparación / tipo de plato (no cocinas por país).
      const STYLE_MAP: Record<string, string> = {
        baked: 'oven-baked dishes', grilled: 'grilled / griddled dishes',
        bowls: 'rice or grain bowls', salads: 'salads',
        pasta: 'pasta dishes', stews: 'soups and stews',
      }
      const styles = preferences.cuisines.map(c => STYLE_MAP[c] ?? c).join(', ')
      prefLines.push(`- Preferred cooking styles / dish types (vary across them, do NOT tie to any national cuisine): ${styles}.`)
    }
    if (preferences.maxCookTime) prefLines.push(`- Max cook time per recipe: ${preferences.maxCookTime} minutes. cookTime MUST NOT exceed it.`)
    if (preferences.calorieGoal && CALORIE_GOAL_RANGES[preferences.calorieGoal]) {
      prefLines.push(`- Calorie goal: every dish must realistically land ${CALORIE_GOAL_RANGES[preferences.calorieGoal]} kcal per serving. Choose dishes that naturally fit it.`)
    }
    const goals = (preferences.nutritionGoals ?? []).filter(g => NUTRITION_GOAL_LABELS[g])
    if (goals.length) prefLines.push(`- Nutrition goals for EVERY dish: ${goals.map(g => NUTRITION_GOAL_LABELS[g]).join(', ')}.`)
    const inc = preferences.includeIngredients?.trim()
    if (inc) prefLines.push(`- Try to include these ingredients across the week: ${this.sanitizeInput(inc)}.`)
    const avo = preferences.avoidIngredients?.trim()
    if (avo) prefLines.push(`- NEVER use these ingredients: ${this.sanitizeInput(avo)}.`)
    if (preferences.budget === 'economic') prefLines.push('- Budget: economic — use cheap, common, easy-to-find ingredients.')
    return prefLines.length ? `USER MENU PREFERENCES (apply to the WHOLE week, on top of the profile):\n${prefLines.join('\n')}\n` : ''
  }

  // Genera los 7 platos (lun..dom) de UNA franja (breakfast|lunch|dinner) en una
  // sola llamada corta. Se invocan en paralelo desde generarMenuSemanal.
  private async generarFranjaSemana(
    meal: string, user: any, language: 'en' | 'es', recentTitles: string[], preferences: MenuPreferences,
  ): Promise<{ title: string; description: string; difficulty: string; cookTime: number }[]> {
    const profileCtx = this.buildProfileContext(user)
    const langInstruction = language === 'es' ? 'Reply in SPANISH.' : 'Reply in ENGLISH.'
    const excludeNote = recentTitles.length > 0
      ? `Avoid repeating any of these (already seen): ${recentTitles.slice(0, 40).map(t => `"${t}"`).join(', ')}.\n` : ''
    const prefsCtx = this.buildMenuPrefsContext(preferences)
    const timeHint = meal === 'breakfast'
      ? 'light, quick breakfasts'
      : meal === 'lunch' ? 'satisfying lunches' : 'comforting dinners'

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', max_tokens: 800, temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a friendly home cook planning the ${meal} for the 7 days of a week (Monday to Sunday). ${langInstruction}
STRICT RULES:
- Provide EXACTLY 7 ${meal} dishes (one per day), ALL DIFFERENT from each other.
- Familiar, popular, easy home dishes. ONLY common, easy-to-find ingredients. NO exotic or restaurant-style names.
- Appropriate for ${meal} (${timeHint}).
- Vary proteins, dish types and cooking styles day to day.
- Respect the user's diet and allergies strictly.
- Honor the USER MENU PREFERENCES below as hard constraints.
${prefsCtx}${excludeNote}${profileCtx}
Reply ONLY with valid JSON: {"dishes":[{"title":"short dish name","description":"one short appetizing line","difficulty":"easy|medium|hard","cookTime":number}, ... exactly 7 in order monday..sunday]}`,
          },
          { role: 'user', content: `Plan 7 different ${meal} dishes for the week. Seed: ${Math.random().toString(36).slice(2)}` },
        ],
      })

      const content = completion.choices?.[0]?.message?.content
      if (!content) throw new Error('AI returned no content')
      const parsed = JSON.parse(content)
      const dishes = Array.isArray(parsed.dishes) ? parsed.dishes : []
      if (dishes.length === 0) throw new Error('Empty menu')

      return Array.from({ length: 7 }, (_, i) => {
        const item = dishes[i] ?? {}
        return {
          title: String(item.title ?? '').trim(),
          description: String(item.description ?? '').trim(),
          difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'easy',
          cookTime: this.normalizeCookTime(item.cookTime),
        }
      })
    } catch {
      throw new BadRequestException('Could not generate weekly menu. Try again.')
    }
  }

  // =========================
  // 📸 ANALIZAR FRIDGE — FOTO (gpt-4o vision)
  // =========================
  async analizarFridge(
    imagesBase64: string[], mealTime: string, userProfile: any,
    language: 'en' | 'es' = 'en', recentTitles: string[] = [],
  ) {
    if (!imagesBase64 || imagesBase64.length === 0) throw new BadRequestException('No images provided');

    const mealCtx = this.getMealContext(mealTime, language)
    const diversityNote = recentTitles.length > 0
      ? `Avoid: ${recentTitles.slice(0, 5).map(t => `"${t}"`).join(', ')}` : ''
    const langInstruction = language === 'es' ? 'Write everything in SPANISH.' : 'Write everything in ENGLISH.'

    const systemPrompt = `Expert chef with computer vision.
Identify all ingredients in photos. Suggest 6 varied recipes using ONLY those (salt, oil, water ok).
${langInstruction} ${mealCtx} ${diversityNote}
Respect diet and allergies.
Reply ONLY with JSON:
{"detectedIngredients":["..."],"suggestions":[{"title":"...","description":"...","difficulty":"easy|medium|hard","cookTime":number,"missingIngredients":[]}]}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 1300, temperature: 0.7, // 6 sugerencias + ingredientes no caben en 800
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: this.buildProfileContext(userProfile) },
        {
          role: 'user', content: [
            ...imagesBase64.map(b64 => ({ type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' as const } })),
            { type: 'text' as const, text: 'What can I cook?' },
          ],
        },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let result: any
    try { result = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) throw new Error('No recipes found')
    return { detectedIngredients: result.detectedIngredients ?? [], suggestions: result.suggestions.slice(0, 6) }
  }

  // =========================
  // 📝 ANALIZAR FRIDGE — TEXTO (gpt-4.1-mini, más barato)
  // =========================
  async analizarFridgeTexto(
    textIngredients: string, mealTime: string, userProfile: any,
    language: 'en' | 'es' = 'en', recentTitles: string[] = [],
  ) {
    const mealCtx = this.getMealContext(mealTime, language)
    const diversityNote = recentTitles.length > 0
      ? `Avoid: ${recentTitles.slice(0, 5).map(t => `"${t}"`).join(', ')}` : ''
    const langInstruction = language === 'es' ? 'Write everything in SPANISH.' : 'Write everything in ENGLISH.'

    const systemPrompt = `You are a professional chef.
The user has these ingredients: ${textIngredients}
Suggest 6 varied recipes using MAINLY those ingredients (salt, oil, water, basic spices ok).
${langInstruction} ${mealCtx} ${diversityNote}
Respect diet type and allergies. Match cooking level.
Reply ONLY with JSON:
{"detectedIngredients":["list what user mentioned"],"suggestions":[{"title":"...","description":"...","difficulty":"easy|medium|hard","cookTime":number,"missingIngredients":["only key missing items"]}]}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini', max_tokens: 1200, temperature: 0.7, // 6 sugerencias no caben en 700
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: this.buildProfileContext(userProfile) },
        { role: 'user', content: `My ingredients: ${textIngredients}` },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let result: any
    try { result = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) throw new Error('No recipes found')
    return { detectedIngredients: result.detectedIngredients ?? [], suggestions: result.suggestions.slice(0, 6) }
  }

  // =========================
  // 🛒 ESTIMAR PRECIOS DE MERCADO (gpt-4.1-mini, 1 llamada batch)
  // =========================
  // Fallback cuando no hay API de Kroger (sin keys o sin ZIP): precio típico USD
  // de supermercado en EE.UU. por unidad estándar de venta. Devuelve centavos o null.
  async estimarPrecios(items: string[]): Promise<Map<string, number | null>> {
    const clean = items.map((i) => (i ?? '').trim()).filter(Boolean).slice(0, 40)
    if (clean.length === 0) return new Map()

    const systemPrompt = `You are a US grocery pricing assistant.
For each item, estimate the typical price in USD at a mainstream US supermarket for ONE standard retail unit (e.g., 1 lb of meat, 1 dozen eggs, 1 bottle/jar, 1 bunch).
Reply ONLY with JSON: {"prices":[{"name":"<exact same name as given>","price":number}]}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini', max_tokens: 900, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Items: ${clean.join(', ')}` },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let result: any
    try { result = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    return this.normalizePrices(result?.prices, clean)
  }

  // Normaliza la respuesta de precios: match por nombre (case-insensitive), clamp
  // $0.10–$150 → centavos; ítems sin precio fiable → null. Puro (testeable sin red).
  normalizePrices(rawPrices: any, requested: string[]): Map<string, number | null> {
    const byName = new Map<string, number>()
    if (Array.isArray(rawPrices)) {
      for (const p of rawPrices) {
        const name = typeof p?.name === 'string' ? p.name.trim().toLowerCase() : ''
        const price = Number(p?.price)
        if (!name || !Number.isFinite(price)) continue
        if (price < 0.1 || price > 150) continue
        byName.set(name, Math.round(price * 100))
      }
    }
    const out = new Map<string, number | null>()
    for (const item of requested) {
      out.set(item, byName.get(item.trim().toLowerCase()) ?? null)
    }
    return out
  }

  private getMealContext(mealTime: string, language: 'en' | 'es'): string {
    const ctx: Record<string, Record<string, string>> = {
      en: { breakfast: 'Breakfast only.', lunch: 'Lunch only.', dinner: 'Dinner only.', snack: 'Light snack only.', dessert: 'Dessert only.', drink: 'Non-alcoholic drink only.', cocktail: 'Cocktail only.', surprise: 'Any recipe.' },
      es: { breakfast: 'Solo desayuno.', lunch: 'Solo almuerzo.', dinner: 'Solo cena.', snack: 'Solo snack ligero.', dessert: 'Solo postre.', drink: 'Solo bebida sin alcohol.', cocktail: 'Solo cóctel.', surprise: 'Cualquier receta.' },
    }
    return ctx[language]?.[mealTime] ?? ''
  }

  // =========================
  // 🍳 GENERAR RECETA
  // =========================

  // Vocabularios fijos — exportados para uso en CacheService
  static readonly VALID_ALLERGENS = [
    'nuts', 'peanuts', 'dairy', 'gluten', 'shellfish', 'fish', 'eggs', 'soy', 'sesame',
  ] as const

  static readonly VALID_DIETARY_TAGS = [
    'omnivore', 'vegetarian', 'vegan', 'gluten_free', 'lactose_free', 'keto',
  ] as const

  async generarReceta(
    message: string, userProfile?: any, isFreeTrial = false,
    language: 'en' | 'es' = 'en', recentTitles: string[] = [],
    skipModeration = false,
  ) {
    const safeMessage = this.sanitizeInput(message || 'Generate a simple recipe')
    const profileContext = this.buildProfileContext(userProfile)

    const mealTypeMatch = safeMessage.match(/\(meal type:\s*(\w+)\)/i)
    const mealType = mealTypeMatch?.[1] ?? null

    // La generación interna (receta del día) usa prompts fijos de confianza, así que se
    // salta el clasificador: evita falsos negativos con el seed y ahorra una llamada.
    // Valida que sea sobre comida Y que encaje con la sección elegida (MEAL_TYPE_MISMATCH).
    if (!skipModeration) {
      await this.assertValidRecipeRequest(safeMessage, mealType)
    }

    const langInstruction = language === 'es' ? 'Write recipe in SPANISH.' : 'Write recipe in ENGLISH.'
    const mealInstructions: Record<string, Record<string, string>> = {
      en: { breakfast: 'BREAKFAST only.', lunch: 'LUNCH only.', dinner: 'DINNER only.', snack: 'SNACK only.', dessert: 'DESSERT only.', drink: 'NON-ALCOHOLIC DRINK only.', cocktail: 'COCKTAIL only.', surprise: '' },
      es: { breakfast: 'Solo DESAYUNO.', lunch: 'Solo ALMUERZO.', dinner: 'Solo CENA.', snack: 'Solo SNACK.', dessert: 'Solo POSTRE.', drink: 'Solo BEBIDA sin alcohol.', cocktail: 'Solo CÓCTEL.', surprise: '' },
    }
    const mealInstruction = mealType ? (mealInstructions[language]?.[mealType] ?? '') : ''
    const timeInstruction = 'If "(available time: X)" in message, cookTime MUST NOT exceed it.'
    const diversityInstruction = recentTitles.length > 0
      ? `Avoid: ${recentTitles.slice(0, 8).map(t => `"${t}"`).join(', ')}. Generate something different.` : ''

    const allergenVocab = OpenaiService.VALID_ALLERGENS.join(', ')
    const dietaryVocab = OpenaiService.VALID_DIETARY_TAGS.join(', ')

    const jsonSchema = `{
  "title":"...",
  "description":"...",
  "ingredients":["..."],
  "tools":["..."],
  "steps":["a DETAILED, explanatory instruction for this step: clearly say WHAT to do, HOW to do it, and what to watch for (visual, texture, aroma, temperature or time cues), in 2-4 complete sentences so even a beginner can follow it without confusion. Do NOT write a short one-line summary.", "..."],
  "stepTips":["ONE short, practical pro-tip for the step at the SAME index — a technique cue, the right tool, an ingredient detail, a doneness/timing signal, or a safety/improvement note. Do NOT just repeat the step. EXACTLY one tip per step, same length and order as steps.", "..."],
  "difficulty":"easy|medium|hard",
  "cookTime":number,
  "servings":number,
  "nutrition":{"calories":number,"protein":number,"carbs":number,"fat":number,"vitaminC":number,"calcium":number,"iron":number,"sodium":number},
  "allergens":["use ONLY these values: ${allergenVocab}. List every allergen present. Empty array if none."],
  "dietaryTags":["use ONLY these values: ${dietaryVocab}. List ALL diets this recipe satisfies."]
}`

    const tipInstruction = 'ALWAYS include "stepTips": exactly one short, useful tip per step, aligned by index to "steps" (same length and order). Each tip must ADD something (technique, tool, ingredient detail, doneness/timing or safety), never just restate the step.'
    const nutritionInstruction = 'ALWAYS include "servings" (how many servings the recipe yields, integer >= 1) and "nutrition" with realistic estimates PER SERVING: "calories" in kcal, "protein"/"carbs"/"fat" in grams, and key micronutrients "vitaminC"/"calcium"/"iron"/"sodium" in mg. Base them on the actual ingredients and quantities.'
    // Constraints del planificador semanal (viajan como hints entre paréntesis en el mensaje)
    const planConstraintInstruction = 'Honor any parenthetical constraints in the message: "(calorie target: X kcal per serving)" → design the recipe so nutrition.calories per serving genuinely falls in that range; "(nutrition goals: ...)" → the ingredients and macros MUST reflect them; "(servings: N)" → the recipe MUST yield exactly N servings.'
    const stepsInstruction = 'Write the "steps" DETAILED and explanatory, NOT a short summary: each step must thoroughly guide the cook through what to do, exactly how to do it, quantities/heat/times involved, and the sensory cues to look for (color, texture, aroma, doneness). Use 2-4 complete sentences per step and be beginner-friendly while staying precise. Prefer fewer, richer steps over many tiny ones.'

    const systemPrompt = isFreeTrial
      ? `World-class chef for young cooks. IMPRESS — delicious, easy, attractive name.
${langInstruction} ${mealInstruction} ${timeInstruction} ${diversityInstruction}
IMPORTANT: always include allergens and dietaryTags with ONLY the allowed vocabulary. ${stepsInstruction} ${tipInstruction} ${nutritionInstruction} ${planConstraintInstruction}
Reply ONLY with JSON: ${jsonSchema}`
      : `Professional chef, personalized recipes.
${langInstruction} ${mealInstruction} ${timeInstruction} ${diversityInstruction}
IMPORTANT: always include allergens and dietaryTags with ONLY the allowed vocabulary. ${stepsInstruction} ${tipInstruction} ${nutritionInstruction} ${planConstraintInstruction}
Reply ONLY with JSON: ${jsonSchema}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini', temperature: 0.8, max_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: profileContext },
        { role: 'user', content: safeMessage },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let recipe: any
    try { recipe = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    if (!recipe.title || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0 ||
        !Array.isArray(recipe.tools) || !Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      throw new Error('Recipe structure invalid')
    }

    recipe.cookTime = this.normalizeCookTime(recipe.cookTime)

    // stepTips: exactamente UN tip corto por paso, alineado por índice. Normalizamos
    // para que SIEMPRE tenga la misma longitud que steps (rellena con '' si faltan,
    // descarta los sobrantes). Reemplaza al antiguo tip general de la receta.
    const rawStepTips: unknown[] = Array.isArray(recipe.stepTips) ? recipe.stepTips : []
    recipe.stepTips = recipe.steps.map((_: unknown, i: number) => {
      const t = rawStepTips[i]
      return typeof t === 'string' ? t.trim() : ''
    })
    delete recipe.tip

    // Nutrición POR PORCIÓN estimada por la IA. Se consolida en un solo objeto
    // { servings, calories, protein, carbs, fat } o null si el modelo no dio números
    // válidos (el frontend oculta la sección si es null).
    recipe.nutrition = this.normalizeNutrition(recipe.nutrition, recipe.servings)
    delete recipe.servings

    // Sanitizar allergens — solo valores del vocabulario fijo
    recipe.allergens = Array.isArray(recipe.allergens)
      ? recipe.allergens.filter(
          (t: unknown): t is string =>
            typeof t === 'string' &&
            (OpenaiService.VALID_ALLERGENS as readonly string[]).includes(t),
        )
      : []

    // Sanitizar dietaryTags — solo valores del vocabulario fijo; default omnivore si vacío
    recipe.dietaryTags = Array.isArray(recipe.dietaryTags)
      ? recipe.dietaryTags.filter(
          (t: unknown): t is string =>
            typeof t === 'string' &&
            (OpenaiService.VALID_DIETARY_TAGS as readonly string[]).includes(t),
        )
      : []
    if (recipe.dietaryTags.length === 0) recipe.dietaryTags = ['omnivore']

    return recipe
  }

  // =========================
  // 🏆 JUZGAR DUELO DE COCINA (gpt-4o vision)
  // Compara las fotos de los platos y devuelve un ranking
  // =========================
  // La imagen del plato puede llegar como URL pública (Supabase Storage, flujo actual)
  // o como base64 crudo (legacy) — la API de visión acepta ambas formas.
  private battleImageUrl(image: string): string {
    return /^https?:\/\//i.test(image) ? image : `data:image/jpeg;base64,${image}`;
  }

  async juzgarBatalla(
    submissions: { userId: number; image: string }[],
    recipeTitle: string,
    language: 'en' | 'es' = 'es',
  ): Promise<{ ranking: { userId: number; rank: number; score: number; comment: string }[]; summary: string }> {
    if (!submissions || submissions.length === 0) throw new BadRequestException('No submissions to judge');

    const langInstruction = language === 'es' ? 'Write all comments and summary in SPANISH.' : 'Write all comments and summary in ENGLISH.'

    // Mapeamos userId → índice para que el modelo no tenga que adivinar IDs largos
    const ids = submissions.map(s => s.userId)
    const systemPrompt = `You are an impartial MasterChef judge evaluating photos of the dish "${recipeTitle}".
You receive ${submissions.length} photos, labeled "Dish #1" ... "Dish #${submissions.length}", one per contestant.
Evaluate presentation, appetizing appearance, technique and how well it matches the recipe.
Give each dish a score from 0 to 100 (no ties — break ties by presentation). Rank them 1 (best) to ${submissions.length} (worst).
${langInstruction}
For each dish, the "comment" must be a brief but specific feedback that names at least ONE positive aspect AND ONE thing to improve (1-2 short sentences), so the contestant learns what worked and what failed.
Reply ONLY with valid JSON:
{"results":[{"dish":number,"score":number,"rank":number,"comment":"one positive point AND one thing to improve"}],"summary":"one short sentence about the winner"}`

    const userContent: any[] = []
    submissions.forEach((s, i) => {
      userContent.push({ type: 'text' as const, text: `Dish #${i + 1}:` })
      userContent.push({ type: 'image_url' as const, image_url: { url: this.battleImageUrl(s.image), detail: 'low' as const } })
    })
    userContent.push({ type: 'text' as const, text: 'Judge these dishes and rank them.' })

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 900, temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let parsed: any
    try { parsed = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) throw new Error('Judge returned no results')

    // Mapear "dish #N" de vuelta al userId real y sanitizar
    const ranking = parsed.results
      .map((r: any) => {
        const dishIdx = Number(r.dish) - 1
        const userId = ids[dishIdx]
        if (userId === undefined) return null
        return {
          userId,
          rank: Number.isFinite(Number(r.rank)) ? Number(r.rank) : 99,
          score: Number.isFinite(Number(r.score)) ? Math.max(0, Math.min(100, Number(r.score))) : 0,
          comment: String(r.comment ?? ''),
        }
      })
      .filter((r: any): r is { userId: number; rank: number; score: number; comment: string } => r !== null)

    if (ranking.length === 0) throw new Error('Judge returned no valid ranking')

    // Reordenar ranks de forma consistente por score descendente (evita empates/huecos)
    ranking.sort((a, b) => b.score - a.score)
    ranking.forEach((r, i) => { r.rank = i + 1 })

    return { ranking, summary: String(parsed.summary ?? '') }
  }

  // =========================
  // 🍽️ JUZGAR PLATOS HETEROGÉNEOS (Buffet/Equipos) — gpt-4o vision
  // Cada foto se evalúa contra SU propio plato, de forma independiente (no se comparan entre sí)
  // =========================
  async juzgarPlatos(
    submissions: { userId: number; image: string; dishTitle: string; courseLabel?: string | null }[],
    language: 'en' | 'es' = 'es',
  ): Promise<{ scores: { userId: number; score: number; comment: string }[]; summary: string }> {
    if (!submissions || submissions.length === 0) throw new BadRequestException('No submissions to judge')

    const langInstruction = language === 'es' ? 'Write all comments and the summary in SPANISH.' : 'Write all comments and the summary in ENGLISH.'
    const ids = submissions.map(s => s.userId)

    const systemPrompt = `You are an impartial MasterChef judge. You receive ${submissions.length} photos, and EACH is a DIFFERENT dish.
Each "Dish #N" lists the recipe it was meant to be (and its course).
Score EACH dish on its OWN merits — presentation, appetizing appearance, technique, and how well it matches its target recipe — independently from the others. Two different dishes may end up with similar or very different scores; that is fine.
Give each dish a score from 0 to 100.
${langInstruction}
For each dish, the "comment" must be a brief but specific feedback that names at least ONE positive aspect AND ONE thing to improve (1-2 short sentences), so the contestant learns what worked and what failed.
Reply ONLY with valid JSON:
{"results":[{"dish":number,"score":number,"comment":"one positive point AND one thing to improve"}],"summary":"one short sentence about the overall menu"}`

    const userContent: any[] = []
    submissions.forEach((s, i) => {
      const course = s.courseLabel ? ` [${s.courseLabel}]` : ''
      userContent.push({ type: 'text' as const, text: `Dish #${i + 1}${course} — target recipe: "${s.dishTitle}":` })
      userContent.push({ type: 'image_url' as const, image_url: { url: this.battleImageUrl(s.image), detail: 'low' as const } })
    })
    userContent.push({ type: 'text' as const, text: 'Score each dish on its own merits.' })

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 1100, temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let parsed: any
    try { parsed = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) throw new Error('Judge returned no results')

    const scores = parsed.results
      .map((r: any) => {
        const dishIdx = Number(r.dish) - 1
        const userId = ids[dishIdx]
        if (userId === undefined) return null
        return {
          userId,
          score: Number.isFinite(Number(r.score)) ? Math.max(0, Math.min(100, Number(r.score))) : 0,
          comment: String(r.comment ?? ''),
        }
      })
      .filter((r: any): r is { userId: number; score: number; comment: string } => r !== null)

    if (scores.length === 0) throw new Error('Judge returned no valid scores')
    return { scores, summary: String(parsed.summary ?? '') }
  }

  // =========================
  // 📸 VERIFICAR PLATO COCINADO (Modo Cocina, fuera de duelos) — gpt-4o vision
  // Un solo plato contra su propia receta: ¿esta foto parece de verdad este plato?
  // Se usa para exigir prueba antes de otorgar el XP de "receta cocinada".
  // A propósito MUY permisivo (lenient): variaciones de emplatado/luz/ingredientes
  // son normales en cocina casera; solo debe rechazar fotos que claramente NO sean
  // este plato (comida totalmente distinta, objetos random, capturas de pantalla, etc.)
  // =========================
  async verificarPlatoCocinado(
    imageBase64: string,
    recipeTitle: string,
    recipeDescription: string | null,
    language: 'en' | 'es' = 'en',
  ): Promise<{ matches: boolean; confidence: number; reason: string }> {
    const langInstruction = language === 'es' ? 'Write the reason in SPANISH.' : 'Write the reason in ENGLISH.'
    const descLine = recipeDescription ? ` — ${recipeDescription}` : ''

    const systemPrompt = `You are a friendly cooking coach checking a photo submitted as proof of a home-cooked dish.
Target recipe: "${recipeTitle}"${descLine}.
Look at the photo and judge if it PLAUSIBLY shows this dish, finished and ready to eat.
Be LENIENT: home cooking varies a lot (plating, lighting, portion, minor ingredient swaps, angle) —
approve anything that is a reasonable, genuine attempt at this dish or something very close to it.
Only reject if the photo clearly shows something else entirely (a different, unrelated food, a random
object, a screenshot, a person, an empty plate, etc.) or is not a food photo at all.
${langInstruction}
Reply ONLY with valid JSON:
{"matches": boolean, "confidence": number (0-100), "reason": "one short, encouraging sentence explaining the verdict"}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 200, temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' } },
            { type: 'text', text: 'Does this photo show the finished dish?' },
          ],
        },
      ],
    })

    const content = completion.choices?.[0]?.message?.content
    if (!content) throw new Error('AI returned no content')
    let result: any
    try { result = JSON.parse(content) } catch { throw new Error('AI returned invalid JSON') }
    return {
      matches: result.matches === true,
      confidence: Number.isFinite(Number(result.confidence)) ? Math.max(0, Math.min(100, Number(result.confidence))) : 0,
      reason: String(result.reason ?? ''),
    }
  }

  // =========================
  // 💬 RESPONDER PREGUNTA
  // =========================
  async responderPreguntaReceta(recipeContext: string, question: string, userProfile?: any, stepContext?: string) {
    const safeQuestion = this.sanitizeInput(question || 'Give me a tip')
    const safeStep = stepContext ? this.sanitizeInput(stepContext) : ''
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini', temperature: 0.4, max_tokens: 350,
      messages: [
        { role: 'system', content: `Chef helping with existing recipe. Max 6 lines. Reply in user's language. Be direct and helpful.` },
        { role: 'system', content: this.buildProfileContext(userProfile) },
        // Modo Cocina: acota la respuesta al paso/pantalla en el que está el usuario.
        ...(safeStep
          ? [{ role: 'system' as const, content: `The user is currently on this step of the recipe:\n"${safeStep}"\nAnswer ONLY within the context of this step.` }]
          : []),
        { role: 'user', content: `Recipe:\n${recipeContext}\n\nQuestion: ${safeQuestion}` },
      ],
    })
    return completion.choices?.[0]?.message?.content ?? 'Could not generate response.'
  }
}