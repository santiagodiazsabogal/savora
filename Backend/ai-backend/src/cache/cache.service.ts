import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OpenaiService } from '../ai/openai.service'
import {
  normalizeAllergies,
  normalizeIngredients,
  getTimeBand,
  buildCacheKey,
  TimeBand,
} from './cache.utils'

export interface CacheLookupParams {
  mealType: string
  ingredients: string[]   // lista cruda, se normalizan internamente
  cookTimeLimit: number   // minutos disponibles del usuario
  userDietType: string    // dietType del usuario
  userAllergies: string | null | undefined
}

export interface CacheHit {
  hit: true
  recipe: Record<string, unknown>
  globalRecipeId: string
}

export interface CacheMiss {
  hit: false
  cacheKey: string
  normalizedIngredients: string[]
  timeBand: TimeBand
  skipCache: boolean  // true si el usuario tiene alergias no mapeables
}

export type CacheLookupResult = CacheHit | CacheMiss

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Intenta servir una receta desde cache.
   * Devuelve CacheHit si hay match válido, CacheMiss en cualquier otro caso.
   */
  async lookup(params: CacheLookupParams): Promise<CacheLookupResult> {
    const { mealType, ingredients, cookTimeLimit, userDietType, userAllergies } = params

    // ── 0. Sin ingredientes explícitos → nunca cache ────────────────────────
    // La clave es (mealType, ingredients, timeBand): con ingredients=[] NO codifica
    // el texto libre del usuario ni los hints del planificador (kcal/objetivos/
    // porciones), así que dos peticiones distintas colisionan en la misma clave y
    // la segunda recibiría una receta que no pidió. El cache es para el flujo CON
    // ingredientes ("use these ingredients": fridge y sugerencias del análisis).
    if (normalizeIngredients(ingredients).length === 0) {
      const timeBand = getTimeBand(cookTimeLimit)
      const cacheKey = buildCacheKey(mealType, [], timeBand)
      return { hit: false, cacheKey, normalizedIngredients: [], timeBand, skipCache: true }
    }

    // ── 1. Fail-safe: alergias no mapeables → nunca cache ──────────────────
    const { tags: allergyTags, unmapped } = normalizeAllergies(userAllergies)
    if (unmapped) {
      this.logger.debug('Cache skip: unmapped allergies')
      const normalizedIngredients = normalizeIngredients(ingredients)
      const timeBand = getTimeBand(cookTimeLimit)
      const cacheKey = buildCacheKey(mealType, normalizedIngredients, timeBand)
      return { hit: false, cacheKey, normalizedIngredients, timeBand, skipCache: true }
    }

    // ── 2. Construir cacheKey ───────────────────────────────────────────────
    const normalizedIngredients = normalizeIngredients(ingredients)
    const timeBand = getTimeBand(cookTimeLimit)
    const cacheKey = buildCacheKey(mealType, normalizedIngredients, timeBand)

    // ── 3. Buscar en DB ─────────────────────────────────────────────────────
    const cached = await this.prisma.globalRecipe.findUnique({ where: { cacheKey } })

    if (!cached) {
      return { hit: false, cacheKey, normalizedIngredients, timeBand, skipCache: false }
    }

    // ── 4. Filtro de alergias ───────────────────────────────────────────────
    const recipeAllergens: string[] = Array.isArray(cached.allergens) ? cached.allergens : []
    const allergyConflict = allergyTags.some(tag => recipeAllergens.includes(tag))
    if (allergyConflict) {
      this.logger.debug(`Cache discard: allergen conflict (${allergyTags}) vs (${recipeAllergens})`)
      return { hit: false, cacheKey, normalizedIngredients, timeBand, skipCache: false }
    }

    // ── 5. Filtro dietético ─────────────────────────────────────────────────
    const recipeDietaryTags: string[] = Array.isArray(cached.dietaryTags) ? cached.dietaryTags : []
    const isOmnivore = userDietType === 'omnivore'
    if (!isOmnivore && !recipeDietaryTags.includes(userDietType)) {
      this.logger.debug(`Cache discard: diet mismatch (user=${userDietType}, recipe=${recipeDietaryTags})`)
      return { hit: false, cacheKey, normalizedIngredients, timeBand, skipCache: false }
    }

    // ── 6. Filtro de tiempo ─────────────────────────────────────────────────
    if (cached.cookTime > cookTimeLimit) {
      this.logger.debug(`Cache discard: cookTime ${cached.cookTime} > limit ${cookTimeLimit}`)
      return { hit: false, cacheKey, normalizedIngredients, timeBand, skipCache: false }
    }

    // ── 7. Cache hit — incrementar contador ────────────────────────────────
    await this.prisma.globalRecipe.update({
      where: { id: cached.id },
      data: { timesServed: { increment: 1 } },
    })

    this.logger.debug(`Cache HIT: ${cached.id} (timesServed=${cached.timesServed + 1})`)

    return {
      hit: true,
      globalRecipeId: cached.id,
      recipe: cached.recipeData as Record<string, unknown>,
    }
  }

  /**
   * Guarda una receta recién generada en GlobalRecipe.
   * Si ya existe el cacheKey (race condition), ignora silenciosamente.
   * No lanza si skipCache es true.
   */
  async save(params: {
    cacheKey: string
    normalizedIngredients: string[]
    timeBand: TimeBand
    mealType: string
    recipe: Record<string, unknown>
    skipCache: boolean
  }): Promise<string | null> {
    if (params.skipCache) return null

    const { cacheKey, normalizedIngredients, timeBand, mealType, recipe } = params

    const cookTime = typeof recipe.cookTime === 'number' ? recipe.cookTime : 30
    const allergens = Array.isArray(recipe.allergens)
      ? (recipe.allergens as string[]).filter(t =>
          (OpenaiService.VALID_ALLERGENS as readonly string[]).includes(t),
        )
      : []
    const dietaryTags = Array.isArray(recipe.dietaryTags) && (recipe.dietaryTags as string[]).length > 0
      ? (recipe.dietaryTags as string[]).filter(t =>
          (OpenaiService.VALID_DIETARY_TAGS as readonly string[]).includes(t),
        )
      : ['omnivore']

    try {
      const saved = await this.prisma.globalRecipe.create({
        data: {
          cacheKey,
          mealType,
          ingredients: normalizedIngredients,
          cookTime,
          timeBand,
          allergens,
          dietaryTags,
          recipeData: recipe as object,
        },
      })
      this.logger.debug(`Cache SAVE: ${saved.id}`)
      return saved.id
    } catch (err: unknown) {
      // P2002 = unique constraint violation (race condition, ya guardado)
      if ((err as any)?.code === 'P2002') {
        this.logger.debug('Cache save skipped: cacheKey already exists (race condition)')
        return null
      }
      this.logger.error('Cache save failed', err)
      return null
    }
  }
}
