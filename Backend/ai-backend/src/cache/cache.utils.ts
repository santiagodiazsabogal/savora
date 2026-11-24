import { createHash } from 'crypto'

// ─── Alérgenos válidos (vocabulario fijo) ────────────────────────────────────
export const VALID_ALLERGEN_TAGS = [
  'nuts', 'peanuts', 'dairy', 'gluten', 'shellfish', 'fish', 'eggs', 'soy', 'sesame',
] as const
export type AllergenTag = (typeof VALID_ALLERGEN_TAGS)[number]

// ─── Diccionario español → tag ───────────────────────────────────────────────
const ALLERGY_DICT: Record<string, AllergenTag> = {
  nueces: 'nuts',
  'frutos secos': 'nuts',
  almendras: 'nuts',
  mani: 'peanuts',
  cacahuete: 'peanuts',
  cacahuates: 'peanuts',
  lacteos: 'dairy',
  leche: 'dairy',
  queso: 'dairy',
  crema: 'dairy',
  gluten: 'gluten',
  trigo: 'gluten',
  harina: 'gluten',
  mariscos: 'shellfish',
  camaron: 'shellfish',
  langostino: 'shellfish',
  pescado: 'fish',
  huevo: 'eggs',
  huevos: 'eggs',
  soya: 'soy',
  soja: 'soy',
  ajonjoli: 'sesame',
  sesamo: 'sesame',
}

// ─── Normalización de texto (lowercase + quitar tildes) ──────────────────────
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ─── normalizeAllergies ───────────────────────────────────────────────────────
/**
 * Convierte texto libre de alergias a tags canónicos.
 * Si alguna palabra no mapea a un tag conocido → unmapped: true (fail-safe).
 */
export function normalizeAllergies(freeText: string | null | undefined): {
  tags: AllergenTag[]
  unmapped: boolean
} {
  if (!freeText || freeText.trim() === '') {
    return { tags: [], unmapped: false }
  }

  // Separar por coma, punto, punto y coma o salto de línea
  const tokens = freeText
    .split(/[,;.\n]+/)
    .map(normalizeText)
    .filter(t => t.length > 0)

  const tags = new Set<AllergenTag>()
  let unmapped = false

  for (const token of tokens) {
    const tag = ALLERGY_DICT[token]
    if (tag) {
      tags.add(tag)
    } else {
      // Token no reconocido → fail-safe: nunca servir cache
      unmapped = true
    }
  }

  return { tags: Array.from(tags), unmapped }
}

// ─── getTimeBand ─────────────────────────────────────────────────────────────
export type TimeBand = 'lte15' | 'lte30' | 'lte45' | 'lte60' | 'gt60'

export function getTimeBand(minutes: number): TimeBand {
  if (minutes <= 15) return 'lte15'
  if (minutes <= 30) return 'lte30'
  if (minutes <= 45) return 'lte45'
  if (minutes <= 60) return 'lte60'
  return 'gt60'
}

// ─── normalizeIngredients ─────────────────────────────────────────────────────
/**
 * Recibe una lista de ingredientes (strings), los normaliza (lowercase, sin
 * tildes) y devuelve una lista canónica sin duplicados, ordenada alfabéticamente.
 */
export function normalizeIngredients(ingredients: string[]): string[] {
  const seen = new Set<string>()
  for (const ing of ingredients) {
    const normalized = normalizeText(ing)
    if (normalized.length > 0) seen.add(normalized)
  }
  return Array.from(seen).sort()
}

// ─── buildCacheKey ────────────────────────────────────────────────────────────
/**
 * Construye un hash SHA-256 determinista a partir de mealType, ingredientes
 * normalizados y timeBand.
 * Los ingredientes DEBEN estar ya normalizados (via normalizeIngredients).
 */
export function buildCacheKey(
  mealType: string,
  normalizedIngredients: string[],
  timeBand: TimeBand,
): string {
  const payload = JSON.stringify({
    mealType: mealType.toLowerCase().trim(),
    ingredients: [...normalizedIngredients].sort(), // garantía extra de orden
    timeBand,
  })
  return createHash('sha256').update(payload).digest('hex')
}
