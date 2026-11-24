import i18n from '../i18n'

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api'

function getHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

async function parseJSON(res: Response) {
  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) return res.json()
  return null
}

// ── Refresh tokens ────────────────────────────────────────────────────────────────
// Access token corto + refresh largo (rotado server-side). `apiFetch` es un drop-in de fetch
// para llamadas a la API: inyecta el access token actual y, si la respuesta es 401, intenta
// refrescar UNA vez (compartido entre llamadas concurrentes) y reintenta. Si el refresh falla,
// limpia los tokens y devuelve el 401 → cada pantalla hace su logout/redirect como hasta ahora.
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const res = await globalThis.fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (!data?.access_token) return false
    localStorage.setItem('token', data.access_token)
    if (data.refresh_token) localStorage.setItem('refreshToken', data.refresh_token)
    return true
  } catch { return false }
}

function doRefresh(): Promise<boolean> {
  if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
  return refreshPromise
}

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const withToken = (): RequestInit => {
    const token = localStorage.getItem('token')
    return {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  }
  const res = await globalThis.fetch(url, withToken())
  if (res.status !== 401) return res
  const refreshed = await doRefresh()
  if (!refreshed) {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    return res
  }
  return globalThis.fetch(url, withToken())
}

// Logout server-side: revoca el refresh token (best-effort).
export async function logoutApi(refreshToken: string) {
  try {
    await globalThis.fetch(`${API_URL}/auth/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch { /* no bloquear el logout local */ }
}

export async function loginUser(email: string, password: string) {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseJSON(res)
  if (!res.ok) throw new Error(data?.message || 'Credenciales incorrectas')
  return data
}

// 🔑 Olvidé mi contraseña → siempre devuelve el mismo mensaje genérico.
// ── 📋 Waitlist pública (sin auth, sin token) ────────────────────────────────
export interface WaitlistJoinResult {
  position: number
  referralCode: string
  totalSignups: number
  alreadyRegistered?: boolean // true si el 409 devolvió su registro previo
}
export interface WaitlistStatus { position: number; referralCount: number; totalSignups: number }

export async function joinWaitlist(email: string, referredByCode?: string): Promise<WaitlistJoinResult> {
  const res = await apiFetch(`${API_URL}/waitlist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...(referredByCode ? { referredByCode } : {}) }),
  })
  const data = await parseJSON(res)
  // Ya registrado → el backend manda su posición/código actuales: tratarlo como éxito.
  if (res.status === 409 && data?.message === 'ALREADY_REGISTERED') {
    return { position: data.position, referralCode: data.referralCode, totalSignups: data.totalSignups, alreadyRegistered: true }
  }
  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (res.status === 400 && data?.message === 'DISPOSABLE_EMAIL') throw new Error('DISPOSABLE_EMAIL')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getWaitlistStatus(referralCode: string): Promise<WaitlistStatus> {
  const res = await apiFetch(`${API_URL}/waitlist/${encodeURIComponent(referralCode)}`, {
    method: 'GET', headers: { 'Content-Type': 'application/json' },
  })
  const data = await parseJSON(res)
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function forgotPassword(email: string) {
  const res = await apiFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await parseJSON(res)
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🔑 Restablecer contraseña con el token del email.
export async function resetPassword(token: string, password: string) {
  const res = await apiFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  const data = await parseJSON(res)
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Cache en memoria del perfil para que volver a una pantalla (ej. Dashboard desde
// Social) renderice al instante sin LoadingScreen. Se refresca en segundo plano.
let cachedProfile: any = null
export function getCachedProfile() { return cachedProfile }
export function clearCachedProfile() { cachedProfile = null; clearBadgesCache(); clearSocialCache(); clearMealPlanCache(); clearCoursesCache(); clearClansCache() }

export async function getProfile() {
  const res = await apiFetch(`${API_URL}/users/profile`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  const data = await parseJSON(res)
  cachedProfile = data
  return data
}

// Meta nutricional personalizada calculada server-side (null sin datos corporales).
export interface PersonalizedGoal {
  weeklyKcal: number
  perMealKcal: number
  tdee: number
}

export async function updateProfile(data: {
  name?: string; cookingLevel?: string; dietType?: string; goal?: string; allergies?: string; username?: string; nutritionGoal?: string;
  weightKg?: number; heightCm?: number; birthYear?: number; sex?: string; activityLevel?: string; mealsPerWeek?: number;
  pantry?: string[]; utensils?: string[]; zipCode?: string
}) {
  const res = await apiFetch(`${API_URL}/users/profile`, {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(data),
  })
  const json = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
  return json
}

// 🗑️ Eliminar cuenta (soft delete + anonimización). Pide la contraseña actual.
// NOTA: el 401 aquí es WRONG_PASSWORD (no expiración de sesión) → propagamos el mensaje.
export async function deleteAccount(password: string) {
  const res = await apiFetch(`${API_URL}/users/account`, {
    method: 'DELETE', headers: getHeaders(), body: JSON.stringify({ password }),
  })
  const data = await parseJSON(res)
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function generateRecipe(message: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/generate`, {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ message, language }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('LIMIT_REACHED')
  if (res.status === 400 && data?.message === 'NOT_FOOD_RELATED') throw new Error('NOT_FOOD_RELATED')
  if (res.status === 400 && data?.message === 'MEAL_TYPE_MISMATCH') throw new Error('MEAL_TYPE_MISMATCH')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getSuggestions(mealType: string | null) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const params = new URLSearchParams({ language })
  if (mealType) params.append('mealType', mealType)
  const res = await apiFetch(`${API_URL}/recipes/suggestions?${params}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 📸 Analizar fridge — foto o texto
// Si se pasan imágenes → modo visión
// Si se pasa textIngredients → modo texto (sin gastar gpt-4o)
export async function analyzeFridge(
  imagesBase64: string[],
  mealTime: string,
  textIngredients?: string,
) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/analyze-fridge`, {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({
      images: imagesBase64,
      mealTime,
      language,
      textIngredients: textIngredients ?? null,
    }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── 🛒 Mercado (grocery list) — PRO/CHEF ─────────────────────────────────────────
// Errores: '401' | 'PRO_ONLY' (403) | 'DAILY_LIMIT_REACHED' (429, solo generate).
export interface MarketItem {
  id: number
  name: string
  quantity: string | null
  note: string | null // nota opcional del usuario (p.ej. preferencia de marca)
  priceCents: number | null
  priceSource: 'ai' | 'manual' | null
  checked: boolean
  recipeTitle: string | null
  createdAt: string
}

async function marketRequest(path: string, init: RequestInit = {}) {
  const res = await apiFetch(`${API_URL}/market${path}`, { headers: getHeaders(), ...init })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (res.status === 429) throw new Error('DAILY_LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getMarket(): Promise<MarketItem[]> {
  return marketRequest('', { method: 'GET' })
}

export async function addMarketItem(item: {
  name: string
  quantity?: string
  note?: string
}): Promise<MarketItem> {
  return marketRequest('/items', { method: 'POST', body: JSON.stringify(item) })
}

export async function updateMarketItem(
  id: number,
  patch: { name?: string; quantity?: string; note?: string; priceCents?: number | null; checked?: boolean },
): Promise<MarketItem> {
  return marketRequest(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function deleteMarketItem(id: number) {
  return marketRequest(`/items/${id}`, { method: 'DELETE' })
}

export async function clearCheckedMarket() {
  return marketRequest('/checked', { method: 'DELETE' })
}

export async function generateMarket(
  items: { name: string; quantity?: string; recipeTitle?: string }[],
): Promise<{ items: MarketItem[]; priceMode: 'ai' | 'none' }> {
  return marketRequest('/generate', { method: 'POST', body: JSON.stringify({ items }) })
}

// Pone precio (estimación IA) a los ítems que no tienen (in-place, sin crear filas).
export async function estimateMarketPrices(): Promise<{ updated: MarketItem[] }> {
  return marketRequest('/estimate', { method: 'POST' })
}

// Solo consulta la receta del día (no genera ni gasta el límite)
export async function getDailyRecipe(mealTime: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/daily?mealTime=${mealTime}&language=${language}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Genera la receta del día bajo demanda (consume 1 del límite FREE)
export async function generateDailyRecipe(mealTime: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/daily?mealTime=${mealTime}&language=${language}`, {
    method: 'POST', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getUserRecipes() {
  const res = await apiFetch(`${API_URL}/recipes`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getRecipeById(recipeId: number) {
  const res = await apiFetch(`${API_URL}/recipes/${recipeId}`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function toggleFavorite(recipeId: number) {
  const res = await apiFetch(`${API_URL}/recipes/${recipeId}/favorite`, { method: 'PATCH', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function deleteRecipe(recipeId: number) {
  const res = await apiFetch(`${API_URL}/recipes/${recipeId}`, { method: 'DELETE', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Marca la receta como cocinada (terminó el Modo Cocina) → exige foto del plato,
// la IA la verifica contra la receta, y solo si coincide otorga XP (1ª vez por receta).
// Devuelve { awarded, xpGained, nivel?, leveledUp?, xpTotal?, verified? }.
// Si la IA rechaza la foto, lanza un Error con message='PHOTO_MISMATCH' y .reason con el motivo.
// 🔥 Calorías consumidas esta semana (recetas con Modo Cocina terminado + nutrición).
export interface WeeklyNutrition {
  weekStart: string
  totalCalories: number
  protein: number // g de la semana
  carbs: number
  fat: number
  perDay: number[] // lunes..domingo
  mealsCount: number
}

export async function getWeeklyNutrition(): Promise<WeeklyNutrition> {
  const res = await apiFetch(`${API_URL}/recipes/weekly-nutrition`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function markRecipeCooked(recipeId: number, photoBase64: string) {
  const res = await apiFetch(`${API_URL}/recipes/${recipeId}/cooked`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ photoBase64 }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) {
    const err = new Error(data?.message || `Error ${res.status}`)
    ;(err as any).reason = data?.reason
    throw err
  }
  return data
}

export async function moveRecipeToFolder(recipeId: number, folderId: number | null) {
  const res = await apiFetch(`${API_URL}/recipes/${recipeId}/folder`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ folderId }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getUserFolders() {
  const res = await apiFetch(`${API_URL}/recipes/folders`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function createFolder(name: string) {
  const res = await apiFetch(`${API_URL}/recipes/folders`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function renameFolder(folderId: number, name: string) {
  const res = await apiFetch(`${API_URL}/recipes/folders/${folderId}`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ name }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function deleteFolder(folderId: number) {
  const res = await apiFetch(`${API_URL}/recipes/folders/${folderId}`, {
    method: 'DELETE', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function sendMessage(message: string, conversationId: number, stepContext?: string) {
  const res = await apiFetch(`${API_URL}/chat/message`, {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({ message, conversationId, ...(stepContext ? { stepContext } : {}) }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🍳 Duelo de cocina — catálogo de recetas del chef (para elegir en cuál competir)
export async function getBattleRecipeOptions() {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/battle/recipe-options?language=${language}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── 🗓️ Planificador Semanal (PRO/CHEF) ──────────────────────────────
// 403 → 'PRO_ONLY' (el PlanGate ya lo cubre, pero lo mapeamos por si acaso).

// Cache stale-while-revalidate del plan (memoria + localStorage, clave = weekStart):
// el planner pinta al instante lo último conocido y revalida por red en 2º plano.
// Se limpia en login/logout (clearCachedProfile) para no mezclar usuarios.
const MEALPLAN_CACHE_KEY = 'savora.mealplan.cache'
const MEALPLAN_CACHE_WEEKS = 4 // semanas retenidas (LRU simple por clave de fecha)
let mealPlanCache: Record<string, unknown> | null = null

function loadMealPlanCache(): Record<string, unknown> {
  if (mealPlanCache) return mealPlanCache
  try { mealPlanCache = JSON.parse(localStorage.getItem(MEALPLAN_CACHE_KEY) || '{}') } catch { mealPlanCache = {} }
  return mealPlanCache!
}

export function getCachedMealPlan(weekStart: string): any | null {
  return (loadMealPlanCache()[weekStart] as any) ?? null
}

export function cacheMealPlan(plan: { weekStart?: string } | null) {
  if (!plan?.weekStart) return
  const cache = loadMealPlanCache()
  cache[plan.weekStart] = plan
  // no crecer sin límite: conservar solo las semanas más recientes
  const keys = Object.keys(cache).sort()
  while (keys.length > MEALPLAN_CACHE_WEEKS) delete cache[keys.shift()!]
  try { localStorage.setItem(MEALPLAN_CACHE_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}

export function clearMealPlanCache() {
  mealPlanCache = null
  try { localStorage.removeItem(MEALPLAN_CACHE_KEY) } catch { /* ignore */ }
}

export async function getMealPlan(weekStart: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/meal-plan?weekStart=${weekStart}&language=${language}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  cacheMealPlan(data)
  return data
}

export async function setMealPlanSlot(input: {
  date: string; mealTime: string; title?: string; recipeId?: number | null; description?: string
}) {
  const res = await apiFetch(`${API_URL}/recipes/meal-plan`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(input),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function deleteMealPlanSlot(entryId: number) {
  const res = await apiFetch(`${API_URL}/recipes/meal-plan/${entryId}`, {
    method: 'DELETE', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function moveMealPlanSlot(entryId: number, target: { date?: string; mealTime?: string }) {
  const res = await apiFetch(`${API_URL}/recipes/meal-plan/${entryId}`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify(target),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Genera todo el menú de la semana con IA (1 llamada barata, solo títulos)
export async function generateWeeklyMenu(weekStart: string, meals: string[], preferences?: Record<string, unknown>) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/meal-plan/generate`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ weekStart, meals, language, preferences: preferences ?? {} }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  cacheMealPlan(data) // la respuesta es el plan completo de la semana
  return data
}

// "Preparar": genera/recupera la receta completa de un slot y devuelve recipeId
export async function prepareMealPlanEntry(entryId: number) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/recipes/meal-plan/${entryId}/prepare`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ language }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getConversations() {
  const res = await apiFetch(`${API_URL}/chat/conversations`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getConversationMessages(conversationId: number) {
  const res = await apiFetch(`${API_URL}/chat/conversations/${conversationId}/messages`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── Cursos de cocina ───────────────────────────────────────────────
export async function getCoursesCatalog() {
  const res = await apiFetch(`${API_URL}/courses/catalog`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return parseJSON(res)
}

export async function getCourseProgress() {
  const res = await apiFetch(`${API_URL}/courses/progress`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return parseJSON(res)
}

export async function getCourseSchedule() {
  const res = await apiFetch(`${API_URL}/courses/schedule`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return parseJSON(res)
}

export async function getMyCourses() {
  const res = await apiFetch(`${API_URL}/courses/my`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return parseJSON(res)
}

export async function getCourseDetail(userCourseId: string) {
  const res = await apiFetch(`${API_URL}/courses/my/${userCourseId}`, { method: 'GET', headers: getHeaders() })
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return parseJSON(res)
}

// Lanza Error con message = 'FREE_LIMIT' | 'COURSE_LOCKED' | 'ALREADY_ENROLLED' según el caso
export async function enrollCourse(catalogId: string) {
  const res = await apiFetch(`${API_URL}/courses/enroll`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ catalogId }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function scheduleLesson(userLessonId: string, scheduledAt: string) {
  const res = await apiFetch(`${API_URL}/courses/lessons/${userLessonId}/schedule`, {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ scheduledAt }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function completeLesson(userLessonId: string) {
  const res = await apiFetch(`${API_URL}/courses/lessons/${userLessonId}/complete`, {
    method: 'PATCH', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function dropCourse(userCourseId: string) {
  const res = await apiFetch(`${API_URL}/courses/my/${userCourseId}`, { method: 'DELETE', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── 🎓 Cursos con IA (TheMealDB + syllabus IA + XP/niveles) — solo CHEF ──
// Catálogo de platos de una categoría, con nivel mínimo y estado de bloqueo.
export async function getAiCatalog(category: string) {
  const res = await apiFetch(`${API_URL}/courses-ai/catalog?category=${encodeURIComponent(category)}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Genera (o trae cacheado) el syllabus de 5 lecciones para un plato, en el idioma activo.
export async function getAiSyllabus(idMeal: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/syllabus?language=${language}`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getAiCourseProgress(idMeal: string) {
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/progress`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Chat de una lección. Devuelve { reply, leccionCompletada }.
export async function chatAiLesson(
  idMeal: string,
  numero: number,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/lessons/${numero}/chat`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ messages }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function completeAiLesson(idMeal: string, numero: number) {
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/lessons/${numero}/complete`, {
    method: 'POST', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Cierra el curso: otorga XP, actualiza stats, misiones e insignias.
export async function completeAiCourse(idMeal: string) {
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/complete`, { method: 'POST', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getMyAiCourses() {
  const res = await apiFetch(`${API_URL}/courses-ai/my`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getAiStats() {
  const res = await apiFetch(`${API_URL}/courses-ai/stats`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getAiBadges() {
  const res = await apiFetch(`${API_URL}/courses-ai/badges`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export interface BadgeItem {
  id: string
  nombre: string
  descripcion: string
  categoria: 'curso' | 'duelo' | 'receta' | 'clan' | 'general'
  requiredPlan: 'PRO' | 'CHEF' | null
  progresoActual: number
  progresoTotal: number
  completada: boolean
  fechaCompletada: string | null
}

// Caché de insignias (stale-while-revalidate) para que Perfil y Logros pinten al INSTANTE
// con lo último conocido y revaliden por red en 2º plano. Persiste en localStorage → tras la
// 1ª carga, el usuario nunca ve un hueco vacío aunque el recompute tarde (latencia Supabase).
const BADGES_CACHE_KEY = 'savora.badges.cache'
let badgesCache: BadgeItem[] | null = null

export function getCachedBadges(): BadgeItem[] | null {
  if (badgesCache) return badgesCache
  try {
    const raw = localStorage.getItem(BADGES_CACHE_KEY)
    if (raw) { badgesCache = JSON.parse(raw); return badgesCache }
  } catch { /* ignore */ }
  return null
}

export function clearBadgesCache() {
  badgesCache = null
  try { localStorage.removeItem(BADGES_CACHE_KEY) } catch { /* ignore */ }
}

// Insignias / logros del usuario (los 3 planes). Recalcula y devuelve todas.
export async function getBadges(): Promise<BadgeItem[]> {
  const res = await apiFetch(`${API_URL}/badges`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  badgesCache = data
  try { localStorage.setItem(BADGES_CACHE_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  return data
}

// ============ Perfiles públicos + amigos ============
export type FriendStatus = 'self' | 'none' | 'friends' | 'request_sent' | 'request_received'

export interface UserCard {
  id: number
  username: string | null
  name: string | null
  nivel: number
}

export interface PublicProfile {
  id: number
  username: string | null
  name: string | null
  plan: string
  nivel: number
  xpTotal: number
  xpForCurrentLevel: number
  xpForNextLevel: number
  badges: BadgeItem[]
  clan: { id: string; nombre: string; avatarUrl: string | null; rol: string } | null
  friendship: { status: FriendStatus; friendshipId?: string }
  isSelf: boolean
}

export interface FriendRequestItem {
  friendshipId: string
  user: UserCard
}

async function handle(res: Response) {
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const res = await apiFetch(`${API_URL}/users/u/${encodeURIComponent(username)}`, { headers: getHeaders() })
  return handle(res)
}

export async function searchUsers(q: string): Promise<UserCard[]> {
  const res = await apiFetch(`${API_URL}/users/search?q=${encodeURIComponent(q)}`, { headers: getHeaders() })
  return handle(res)
}

export async function checkUsername(u: string): Promise<{ username: string; available: boolean }> {
  const res = await apiFetch(`${API_URL}/users/username-available?u=${encodeURIComponent(u)}`, { headers: getHeaders() })
  return handle(res)
}

export async function getFriends(): Promise<UserCard[]> {
  const res = await apiFetch(`${API_URL}/friends`, { headers: getHeaders() })
  return handle(res)
}

export async function getFriendRequests(): Promise<FriendRequestItem[]> {
  const res = await apiFetch(`${API_URL}/friends/requests`, { headers: getHeaders() })
  return handle(res)
}

export async function getFriendCounts(): Promise<{ friends: number; requests: number }> {
  const res = await apiFetch(`${API_URL}/friends/counts`, { headers: getHeaders() })
  return handle(res)
}

export async function sendFriendRequest(body: { username?: string; userId?: number }) {
  const res = await apiFetch(`${API_URL}/friends/request`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) })
  return handle(res)
}

export async function acceptFriendRequest(id: string) {
  const res = await apiFetch(`${API_URL}/friends/requests/${id}/accept`, { method: 'POST', headers: getHeaders() })
  return handle(res)
}

export async function rejectFriendRequest(id: string) {
  const res = await apiFetch(`${API_URL}/friends/requests/${id}/reject`, { method: 'POST', headers: getHeaders() })
  return handle(res)
}

export async function removeFriend(userId: number) {
  const res = await apiFetch(`${API_URL}/friends/${userId}`, { method: 'DELETE', headers: getHeaders() })
  return handle(res)
}

// Misiones diarias del usuario (pool compartido, 1 fácil / 1 media / 1 difícil).
// Cache stale-while-revalidate de cursos (memoria + localStorage): misiones del catálogo
// y roadmap por categoría pintan al instante lo último conocido y revalidan en 2º plano.
// Se limpia en login/logout (clearCachedProfile) para no mezclar usuarios.
const COURSES_CACHE_KEY = 'savora.courses.cache'
let coursesCache: Record<string, unknown> | null = null

function loadCoursesCache(): Record<string, unknown> {
  if (coursesCache) return coursesCache
  try { coursesCache = JSON.parse(localStorage.getItem(COURSES_CACHE_KEY) || '{}') } catch { coursesCache = {} }
  return coursesCache!
}

function cacheCourses(key: string, data: unknown) {
  const cache = loadCoursesCache()
  cache[key] = data
  try { localStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}

export function getCachedTodayMissions(): any | null { return (loadCoursesCache()['missions'] as any) ?? null }
export function getCachedCategoryRoadmap(category: string): any | null { return (loadCoursesCache()[`roadmap:${category}`] as any) ?? null }

export function clearCoursesCache() {
  coursesCache = null
  try { localStorage.removeItem(COURSES_CACHE_KEY) } catch { /* ignore */ }
}

export async function getTodayMissions() {
  const res = await apiFetch(`${API_URL}/missions/today`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  cacheCourses('missions', data)
  return data
}

// ── Roadmap POR CATEGORÍA (recetas de la categoría + habilidades intercaladas) ──
export async function getCategoryRoadmap(category: string) {
  const res = await apiFetch(`${API_URL}/courses-ai/category-roadmap?category=${encodeURIComponent(category)}`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  cacheCourses(`roadmap:${category}`, data)
  return data
}

// Retroalimentación de la IA (GPT-4o visión) sobre la foto del plato terminado.
export async function getCourseFeedback(idMeal: string, imageBase64: string) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/feedback`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ image: imageBase64, language }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Ayuda visual EN VIVO del copiloto durante un paso (GPT-4o step-aware): "¿voy bien?".
// _stepIdx es informativo (el backend usa el número de lección + el texto del paso).
export async function getCourseStepHelp(
  idMeal: string, numero: number, _stepIdx: number, stepText: string, imageBase64: string,
) {
  const language = i18n.language?.startsWith('es') ? 'es' : 'en'
  const res = await apiFetch(`${API_URL}/courses-ai/${idMeal}/lessons/${numero}/step-help`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ image: imageBase64, stepText, language }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 429) throw new Error('DAILY_LIMIT_REACHED')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── 🌐 Red social (los 3 planes, sin límite) ───────────────────────
export type SocialPostType = 'PHOTO' | 'RECIPE'

export interface SocialPost {
  id: string
  type: SocialPostType
  imageUrl: string
  caption: string | null
  recipeId: number | null
  recipeTitle: string | null
  recipeCookTime: number | null
  recipeDifficulty: string | null
  recipeMealTime: string | null
  likeCount: number
  likedByMe: boolean
  createdAt: string
  author: { id: number; name: string | null; username: string | null }
}

export interface SocialFeed {
  items: SocialPost[]
  nextCursor: string | null
}

export interface SocialTop {
  photos: SocialPost[]
  recipes: SocialPost[]
}

// Caché stale-while-revalidate del feed (1ª página) + Top del día: reabrir Social pinta al
// instante lo último conocido y revalida por red en 2º plano (las imágenes ya están en caché
// del navegador). Persiste en localStorage. Se limpia en login/logout (clearCachedProfile).
const SOCIAL_FEED_KEY = 'savora.social.feed'
const SOCIAL_TOP_KEY = 'savora.social.top'
let socialFeedCache: SocialFeed | null = null
let socialTopCache: SocialTop | null = null

export function getCachedSocialFeed(): SocialFeed | null {
  if (socialFeedCache) return socialFeedCache
  try { const r = localStorage.getItem(SOCIAL_FEED_KEY); if (r) { socialFeedCache = JSON.parse(r); return socialFeedCache } } catch { /* ignore */ }
  return null
}
export function getCachedSocialTop(): SocialTop | null {
  if (socialTopCache) return socialTopCache
  try { const r = localStorage.getItem(SOCIAL_TOP_KEY); if (r) { socialTopCache = JSON.parse(r); return socialTopCache } } catch { /* ignore */ }
  return null
}
export function clearSocialCache() {
  socialFeedCache = null; socialTopCache = null
  try { localStorage.removeItem(SOCIAL_FEED_KEY); localStorage.removeItem(SOCIAL_TOP_KEY) } catch { /* ignore */ }
}

// Publicar una foto libre o una receta propia (imageBase64 acepta data URL con o sin prefijo)
export async function createSocialPost(input: {
  type: SocialPostType
  imageBase64: string
  caption?: string
  recipeId?: number | null
}): Promise<SocialPost> {
  const res = await apiFetch(`${API_URL}/social/posts`, {
    method: 'POST', headers: getHeaders(),
    body: JSON.stringify({
      type: input.type,
      imageBase64: input.imageBase64,
      caption: input.caption ?? null,
      recipeId: input.recipeId ?? null,
    }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getSocialFeed(cursor?: string, type?: SocialPostType): Promise<SocialFeed> {
  const params = new URLSearchParams()
  if (cursor) params.append('cursor', cursor)
  if (type) params.append('type', type)
  const qs = params.toString()
  const res = await apiFetch(`${API_URL}/social/feed${qs ? `?${qs}` : ''}`, {
    method: 'GET', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  // Cachear solo la 1ª página del feed por defecto (sin cursor ni filtro de tipo).
  if (!cursor && !type) {
    socialFeedCache = data
    try { localStorage.setItem(SOCIAL_FEED_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }
  return data
}

export async function getSocialTop(): Promise<SocialTop> {
  const res = await apiFetch(`${API_URL}/social/top`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  socialTopCache = data
  try { localStorage.setItem(SOCIAL_TOP_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  return data
}

// Toggle corazón. Devuelve { liked, likeCount }.
export async function toggleSocialLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await apiFetch(`${API_URL}/social/posts/${postId}/like`, {
    method: 'POST', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function deleteSocialPost(postId: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_URL}/social/posts/${postId}`, {
    method: 'DELETE', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🔖 Guardar la receta de un post compartido como copia propia (idempotente).
export async function saveSharedRecipe(postId: string): Promise<{ saved: boolean; alreadySaved: boolean; recipeId: number }> {
  const res = await apiFetch(`${API_URL}/social/posts/${postId}/save-recipe`, {
    method: 'POST', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🚩 Reportar una publicación.
export async function reportSocialPost(postId: string, reason: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_URL}/social/posts/${postId}/report`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🚩 Reportar un usuario.
export async function reportSocialUser(userId: number, reason: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_URL}/social/users/${userId}/report`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// 🚫 Bloquear / desbloquear un usuario.
export async function blockSocialUser(userId: number): Promise<{ success: boolean; blocked: boolean }> {
  const res = await apiFetch(`${API_URL}/social/users/${userId}/block`, {
    method: 'POST', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function unblockSocialUser(userId: number): Promise<{ success: boolean; blocked: boolean }> {
  const res = await apiFetch(`${API_URL}/social/users/${userId}/block`, {
    method: 'DELETE', headers: getHeaders(),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function getBlockedUsers(): Promise<{ id: number; name: string | null; username: string | null }[]> {
  const res = await apiFetch(`${API_URL}/social/blocked`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ===== Admin / panel de moderación (solo isAdmin) =====
export interface AdminUserLite { id: number; name: string | null; username: string | null; bannedAt?: string | null }
export interface AdminReport {
  id: string
  targetType: 'POST' | 'USER'
  reason: string
  status: string
  createdAt: string
  reporter: AdminUserLite
  reportedUser: AdminUserLite
  postId: string | null
  post: { id: string; imageUrl: string; caption: string | null; type: string } | null
}

export async function getAdminReports(status = 'pending'): Promise<AdminReport[]> {
  const res = await apiFetch(`${API_URL}/admin/reports?status=${status}`, { method: 'GET', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('NOT_ADMIN')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function adminActionReport(id: string, action: 'dismiss' | 'remove_content' | 'ban_user') {
  const res = await apiFetch(`${API_URL}/admin/reports/${id}/action`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ action }),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

export async function adminUnbanUser(userId: number) {
  const res = await apiFetch(`${API_URL}/admin/users/${userId}/unban`, { method: 'POST', headers: getHeaders() })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// ── 👥 Clanes (PRO/CHEF) ────────────────────────────────────────────
async function clanRequest(path: string, method: string = 'GET', body?: any) {
  const res = await apiFetch(`${API_URL}/clans${path}`, {
    method,
    headers: getHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await parseJSON(res)
  if (res.status === 401) throw new Error('401')
  if (res.status === 403) throw new Error('PRO_ONLY')
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`)
  return data
}

// Caché stale-while-revalidate de la pantalla de Clanes (mi clan + ranking):
// entrar desde la pastilla pinta al instante sin LoadingScreen y revalida detrás.
const CLANS_BROWSE_KEY = 'savora.clans.browse'
let clansBrowseCache: { myClan: any; clans: any[] } | null = null

export function getCachedClansBrowse(): { myClan: any; clans: any[] } | null {
  if (clansBrowseCache) return clansBrowseCache
  try { const r = localStorage.getItem(CLANS_BROWSE_KEY); if (r) { clansBrowseCache = JSON.parse(r); return clansBrowseCache } } catch { /* ignore */ }
  return null
}
export function cacheClansBrowse(myClan: any, clans: any[]) {
  clansBrowseCache = { myClan, clans }
  try { localStorage.setItem(CLANS_BROWSE_KEY, JSON.stringify(clansBrowseCache)) } catch { /* ignore */ }
}
export function clearClansCache() {
  clansBrowseCache = null
  try { localStorage.removeItem(CLANS_BROWSE_KEY) } catch { /* ignore */ }
}

export function browseClans(search?: string) {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
  return clanRequest(q)
}
export function getMyClan() {
  return clanRequest('/mine')
}
export function getClanDetail(id: string) {
  return clanRequest(`/${id}`)
}
export function createClan(body: {
  nombre: string; descripcion?: string; tipoAcceso?: string; especializacion?: string | null; avatarUrl?: string | null
}) {
  return clanRequest('', 'POST', body)
}
export function updateClan(id: string, body: {
  descripcion?: string; tipoAcceso?: string; especializacion?: string | null; avatarUrl?: string | null
}) {
  return clanRequest(`/${id}`, 'PATCH', body)
}
export function joinClan(id: string) {
  return clanRequest(`/${id}/join`, 'POST')
}
export function leaveClan(id: string) {
  return clanRequest(`/${id}/leave`, 'POST')
}
export function acceptClanRequest(requestId: string) {
  return clanRequest(`/requests/${requestId}/accept`, 'POST')
}
export function rejectClanRequest(requestId: string) {
  return clanRequest(`/requests/${requestId}/reject`, 'POST')
}
export function promoteClanMember(id: string, userId: number) {
  return clanRequest(`/${id}/members/${userId}/promote`, 'POST')
}
export function demoteClanMember(id: string, userId: number) {
  return clanRequest(`/${id}/members/${userId}/demote`, 'POST')
}
export function kickClanMember(id: string, userId: number) {
  return clanRequest(`/${id}/members/${userId}/kick`, 'POST')
}
export function getClanMissions(id: string) {
  return clanRequest(`/${id}/missions`)
}
export function getClanMessages(id: string) {
  return clanRequest(`/${id}/messages`)
}
export function sendClanMessage(
  id: string,
  payload: { contenido?: string; imagenUrl?: string | null; replyToId?: string | null },
) {
  return clanRequest(`/${id}/messages`, 'POST', payload)
}
export function reactClanMessage(id: string, messageId: string, emoji: string) {
  return clanRequest(`/${id}/messages/${messageId}/react`, 'POST', { emoji })
}