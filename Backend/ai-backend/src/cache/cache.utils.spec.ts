import {
  normalizeAllergies,
  normalizeIngredients,
  buildCacheKey,
  getTimeBand,
} from './cache.utils'

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAllergies
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeAllergies', () => {
  test('texto vacío → tags vacíos, unmapped false', () => {
    expect(normalizeAllergies('')).toEqual({ tags: [], unmapped: false })
  })

  test('null → tags vacíos, unmapped false', () => {
    expect(normalizeAllergies(null)).toEqual({ tags: [], unmapped: false })
  })

  test('undefined → tags vacíos, unmapped false', () => {
    expect(normalizeAllergies(undefined)).toEqual({ tags: [], unmapped: false })
  })

  test('"nueces, lácteos" → [nuts, dairy], unmapped false', () => {
    const result = normalizeAllergies('nueces, lácteos')
    expect(result.unmapped).toBe(false)
    expect(result.tags).toContain('nuts')
    expect(result.tags).toContain('dairy')
    expect(result.tags).toHaveLength(2)
  })

  test('sinónimo "cacahuete" → peanuts', () => {
    const { tags, unmapped } = normalizeAllergies('cacahuete')
    expect(unmapped).toBe(false)
    expect(tags).toEqual(['peanuts'])
  })

  test('sinónimo "queso" → dairy', () => {
    const { tags, unmapped } = normalizeAllergies('queso')
    expect(unmapped).toBe(false)
    expect(tags).toEqual(['dairy'])
  })

  test('sinónimo "camarón" → shellfish', () => {
    const { tags, unmapped } = normalizeAllergies('camarón')
    expect(unmapped).toBe(false)
    expect(tags).toEqual(['shellfish'])
  })

  test('insensible a mayúsculas: "LÁCTEOS" → dairy', () => {
    const { tags, unmapped } = normalizeAllergies('LÁCTEOS')
    expect(unmapped).toBe(false)
    expect(tags).toEqual(['dairy'])
  })

  test('insensible a tildes: "Lacteos" → dairy', () => {
    const { tags, unmapped } = normalizeAllergies('Lacteos')
    expect(unmapped).toBe(false)
    expect(tags).toEqual(['dairy'])
  })

  test('palabra no mapeada "nopal" → unmapped true (fail-safe)', () => {
    const { unmapped } = normalizeAllergies('nopal')
    expect(unmapped).toBe(true)
  })

  test('mezcla mapeada + no mapeada "nueces, nopal" → unmapped true', () => {
    const { tags, unmapped } = normalizeAllergies('nueces, nopal')
    expect(unmapped).toBe(true)
    expect(tags).toContain('nuts') // la parte mapeada sí se extrae
  })

  test('duplicados se colapsan', () => {
    const { tags } = normalizeAllergies('leche, queso')
    // ambos mapean a dairy → solo un tag
    expect(tags.filter(t => t === 'dairy')).toHaveLength(1)
  })

  test('separador punto y coma funciona', () => {
    const { tags, unmapped } = normalizeAllergies('gluten; huevos')
    expect(unmapped).toBe(false)
    expect(tags).toContain('gluten')
    expect(tags).toContain('eggs')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// normalizeIngredients
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeIngredients', () => {
  test('colapsa mayúsculas a lowercase', () => {
    expect(normalizeIngredients(['Tomate', 'CEBOLLA'])).toEqual(['cebolla', 'tomate'])
  })

  test('quita tildes', () => {
    expect(normalizeIngredients(['Ají', 'ajo'])).toEqual(['aji', 'ajo'])
  })

  test('elimina duplicados', () => {
    const result = normalizeIngredients(['tomate', 'Tomate', 'TOMATE'])
    expect(result).toEqual(['tomate'])
  })

  test('mismo set en distinto orden → misma salida canónica', () => {
    const a = normalizeIngredients(['cebolla', 'tomate', 'ajo'])
    const b = normalizeIngredients(['tomate', 'ajo', 'cebolla'])
    expect(a).toEqual(b)
  })

  test('lista vacía → []', () => {
    expect(normalizeIngredients([])).toEqual([])
  })

  test('filtra strings vacíos', () => {
    expect(normalizeIngredients(['tomate', '', '  '])).toEqual(['tomate'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildCacheKey
// ─────────────────────────────────────────────────────────────────────────────
describe('buildCacheKey', () => {
  const ings = ['ajo', 'cebolla', 'tomate']

  test('determinista: misma entrada → mismo hash', () => {
    const h1 = buildCacheKey('lunch', ings, 'lte30')
    const h2 = buildCacheKey('lunch', ings, 'lte30')
    expect(h1).toBe(h2)
  })

  test('distinto mealType → hash distinto', () => {
    const h1 = buildCacheKey('lunch', ings, 'lte30')
    const h2 = buildCacheKey('dinner', ings, 'lte30')
    expect(h1).not.toBe(h2)
  })

  test('distinto timeBand → hash distinto', () => {
    const h1 = buildCacheKey('lunch', ings, 'lte30')
    const h2 = buildCacheKey('lunch', ings, 'lte60')
    expect(h1).not.toBe(h2)
  })

  test('distintos ingredientes → hash distinto', () => {
    const h1 = buildCacheKey('lunch', ['ajo', 'cebolla'], 'lte30')
    const h2 = buildCacheKey('lunch', ['ajo', 'zanahoria'], 'lte30')
    expect(h1).not.toBe(h2)
  })

  test('ingredientes en distinto orden → MISMO hash', () => {
    const h1 = buildCacheKey('lunch', ['ajo', 'cebolla', 'tomate'], 'lte30')
    const h2 = buildCacheKey('lunch', ['tomate', 'ajo', 'cebolla'], 'lte30')
    expect(h1).toBe(h2)
  })

  test('hash es string hex de 64 chars (SHA-256)', () => {
    const h = buildCacheKey('lunch', ings, 'lte30')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getTimeBand
// ─────────────────────────────────────────────────────────────────────────────
describe('getTimeBand', () => {
  test('15 → lte15', () => expect(getTimeBand(15)).toBe('lte15'))
  test('16 → lte30', () => expect(getTimeBand(16)).toBe('lte30'))
  test('30 → lte30', () => expect(getTimeBand(30)).toBe('lte30'))
  test('31 → lte45', () => expect(getTimeBand(31)).toBe('lte45'))
  test('45 → lte45', () => expect(getTimeBand(45)).toBe('lte45'))
  test('46 → lte60', () => expect(getTimeBand(46)).toBe('lte60'))
  test('60 → lte60', () => expect(getTimeBand(60)).toBe('lte60'))
  test('61 → gt60',  () => expect(getTimeBand(61)).toBe('gt60'))
  test('120 → gt60', () => expect(getTimeBand(120)).toBe('gt60'))
  test('1 → lte15',  () => expect(getTimeBand(1)).toBe('lte15'))
})
