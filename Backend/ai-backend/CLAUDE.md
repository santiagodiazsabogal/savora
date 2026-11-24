# Savora — Backend (ai-backend)

## Qué es esto
Backend de Savora, una app de generación de recetas con IA para Gen Z. Stack: NestJS + Prisma + Supabase (PostgreSQL) + OpenAI.

## Stack
- **Framework:** NestJS (TypeScript)
- **ORM:** Prisma
- **DB:** Supabase (PostgreSQL) — proyecto `MVP-backend` en `us-west-2`
- **IA:** OpenAI `gpt-4.1-mini` para recetas y chat, `gpt-4o` para visión (análisis de fridge)
- **Auth:** JWT con `@nestjs/jwt` + guards
- **Email:** Resend (verificación de cuenta)
- **Entorno:** Windows / PowerShell

## Estructura de módulos
```
src/
  auth/         → registro, login, verificación email, JWT strategy
  users/        → perfil, update, DTO
  recipes/      → generación, favoritos, carpetas, sugerencias, daily recipe, fridge analyzer
  market/       → 🛒 mercado (grocery list, todos los planes): CRUD + precio estimado por IA (ver sección 🛒)
  chat/         → mensajes, intent detection
  ai/           → openai.service.ts (toda la lógica de IA)
  tts/          → text-to-speech (xAI, pendiente créditos; caché EFÍMERO en memoria, no DB)
  prisma/       → PrismaService
prisma/
  schema.prisma → modelos: User, Recipe, Conversation, Message, RecipeFolder
```

## Modelos Prisma principales
```prisma
model User {
  id            Int      @id @default(autoincrement())
  email         String   @unique
  password      String   (bcrypt)
  name          String?
  cookingLevel  String?  // 'beginner' | 'intermediate' | 'advanced'
  dietType      String?  // 'omnivore' | 'vegetarian' | 'vegan' | 'gluten_free' | 'lactose_free' | 'keto'
  goal          String?  // 'eat_healthy' | 'save_money' | 'learn_cooking' | 'explore' | 'cook_fast'
  allergies     String?
  plan          Plan     @default(FREE)  // FREE | PRO
  requestsUsed  Int      @default(0)
  isVerified    Boolean  @default(false)
}

model Recipe {
  id            Int       // recetas del usuario
  userId        Int
  title         String
  description   String?
  tip           String?
  ingredients   Json
  tools         Json
  steps         Json
  stepTips      Json?     // un tip por paso, alineado por índice a steps (reemplaza el tip general)
  difficulty    String?
  cookTime      Int?
  isFavorite    Boolean   @default(false)
  folderId      Int?
  isDailyRecipe Boolean   @default(false)
  dailyDate     DateTime?
  mealTime      String?   // 'breakfast'|'lunch'|'dinner'|'snack'|'dessert'|'drink'|'cocktail'|'surprise'
}
```

## Endpoints principales
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/verify-email?token=...
POST /api/auth/forgot-password    { email }            (respuesta genérica anti-enumeración)
POST /api/auth/reset-password     { token, password }  (token de 1 solo uso, 1h)

GET  /api/users/profile
PUT  /api/users/profile
DELETE /api/users/account        { password }          (borrar cuenta: soft delete + anonimización)

POST /api/recipes/generate        { message, language }
GET  /api/recipes/daily           ?mealTime=&language=   (peek: muestra la receta GRATIS — genera la global si hace falta, NO crea copia per-usuario ni gasta límite)
POST /api/recipes/daily           ?mealTime=&language=   ("Preparar receta": crea copia per-usuario y consume 1 límite FREE)
GET  /api/recipes/suggestions     ?mealType=&language=
POST /api/recipes/analyze-fridge  { images[], mealTime, language }
GET  /api/recipes
GET  /api/recipes/:id
PATCH /api/recipes/:id/favorite
DELETE /api/recipes/:id
PATCH /api/recipes/:id/folder     { folderId }

GET  /api/recipes/folders
POST /api/recipes/folders         { name }
PATCH /api/recipes/folders/:id    { name }
DELETE /api/recipes/folders/:id

POST /api/chat/message            { message, conversationId }
GET  /api/chat/conversations
GET  /api/chat/conversations/:id/messages
```

## Reglas de negocio críticas
- **Plan FREE = 3 recetas** (requestsUsed se incrementa solo en éxito)
- **El chat NO consume el límite** — solo `recipes/generate`, `POST recipes/daily` y `recipes/analyze-fridge` cuando genera
- **Receta del día (banner sin muro):** el dashboard hace `GET /daily` (peek) al cargar y **muestra la receta directamente, gratis** — el peek genera la global si hace falta pero NO crea copia per-usuario ni gasta límite. Solo `POST /daily`, al tocar "Preparar receta", crea la copia per-usuario y consume 1. Si el usuario ya la preparó hoy, "Preparar receta" navega a la receta sin recobrar (devuelve la copia existente).
- **Receta del día es GLOBAL** (tabla `DailyRecipe`): una sola receta compartida por todos los usuarios del mismo idioma, por `(franja, idioma, día)`. El primer usuario que la carga (peek) la genera (genérica, sin perfil); el resto reciben esa misma cacheada. Mostrarla es gratis; al preparar (`POST /daily`) se crea una copia per-usuario en `Recipe` (para favoritos/historial) y se cobra el límite. Dedup global: `DailyRecipe.titleKey` es único por idioma → una receta del día NUNCA se repite (en ninguna franja ni día). Por ser global, NO respeta dietType/alergias individuales (como las recetas de duelos)
- **El análisis de fridge** (gpt-4o vision) NO consume el límite — solo la generación posterior
- **Diversidad:** generate/sugerencias leen los últimos 10 títulos del usuario; la receta del día global pasa los últimos ~60 títulos globales al prompt + dedup por DB
- **Valores de perfil en inglés:** cookingLevel, dietType, goal se guardan en inglés en la DB

## openai.service.ts — métodos clave
- `generarReceta(message, user, isFreeTrial, language, recentTitles)` → genera receta completa
- `generarSugerencias(user, mealType, language, recentTitles, favoriteTitles)` → 4 sugerencias con nombre + descripción, priorizando no repetidas y no favoritas. **Es category-aware por `mealType`** (cada franja tiene su `kindLine` + `examples` en el prompt): cóctel→cócteles, bebida→bebidas no alcohólicas, postre→postres, snack→snacks, **breakfast→desayunos** (pancakes/huevos/avena), **lunch→mains ligeros** (ensaladas/sándwiches/wraps), **dinner→mains contundentes** (pollo/tacos/curry), surprise→cualquiera. (Antes todo caía en un prompt hardcodeado a "dishes" → devolvía comida aunque pidieras "Cocktail", y desayuno proponía tacos.) `fallbackSuggestions` también tiene pools por categoría (cocktail/drink/dessert/breakfast/food). **(2026-07-13)** cada sugerencia ahora también trae `missingIngredients` (3-6 ingredientes clave GENÉRICOS, sin cantidades — mismo formato que `analizarFridgeTexto`) → habilita el flujo "Any recipe" del wizard: se mandan directo al mercado sin tener que generar la receta completa. `fallbackSuggestions` los deja en `[]` (caso IA caída).
- `analizarFridge(images[], mealTime, user, language, recentTitles)` → visión con gpt-4o
- `responderPreguntaReceta(context, question, user)` → respuesta de chat
- `isCookingRelated(message)` → clasificador binario yes/no (evita gastar tokens en inputs inválidos)

## Convenciones
- Siempre español en comentarios y mensajes de error al usuario
- Los prompts a OpenAI van en inglés internamente
- `language` param controla el idioma de la respuesta de la IA ('en' | 'es')
- Nunca usar `any` sin justificación
- Prisma siempre con try/catch en operaciones críticas

## Estado actual (fase 2 — casi completa)
### ✅ Implementado
- Auth completo (registro, login, verificación email)
- Generación de recetas con límite FREE
- Chat con el chef (sin límite)
- Receta del día (caché diario)
- Análisis de fridge con visión (gpt-4o)
- Sugerencias personalizadas con filtro de historial
- Carpetas de recetas
- Favoritos
- i18n: recetas en ES o EN según idioma del usuario
- Validación de intención culinaria antes de gastar tokens
- Diversidad: evita repetir recetas recientes

### ⏳ Pendiente
- TTS (xAI API — pendiente créditos)
- ✅ HECHO (parcial): unit tests críticos (`jest`, 92 tests) — billing webhook (asignación de plan +
  fail-closed del secreto), auth (login gate verificado/baneado/borrado + rotación de refresh, un solo uso),
  límites de IA (FREE=3, cupo diario PRO 40/CHEF 100 → 429). Patrón: `new Service(mockPrisma)` (sin DB, sin DI
  de Nest). Falta e2e real (necesita DB de test separada, no la de prod).
- GlobalRecipe cache (tabla compartida para no regenerar recetas populares)
- iOS nativo: wrapper Capacitor + SDK RevenueCat (paywall) — bloque para publicar en App Store
- ✅ HECHO (paso 3 robustez): rate limiting, tope diario de IA, filtro de errores + Sentry, refresh tokens (ver sección 🛡️ Robustez)

## Variables de entorno (.env)
```
DATABASE_URL=
JWT_SECRET=
OPENAI_API_KEY=
RESEND_API_KEY=
CORS_ORIGIN=http://localhost:5173
PORT=3000
# Robustez (todas OPCIONALES, con defaults):
ACCESS_TOKEN_TTL=1d        # caducidad del access token (default 1d)
REFRESH_TOKEN_TTL_DAYS=30  # caducidad del refresh token en días (default 30)
SENTRY_DSN=                # si está, reporta los 5xx a Sentry (si no, no-op)
```

## Comandos útiles
```bash
npm run start:dev          # desarrollo
npx prisma generate        # regenerar cliente después de cambiar schema
npx prisma db push         # sincronizar schema con DB (dev)
npx prisma studio          # UI para ver la DB
```

## Notas importantes
- La DB puede pausarse en Supabase (plan free) — restaurar desde el dashboard si da error P1001
- Windows/PowerShell: no usar backslashes en curl, usar comandos en una sola línea
- El schema.prisma está en `/prisma/schema.prisma` (no en src/)

## ⚠️ DRIFT de schema — cuidado con `prisma db push`
Históricamente el `schema.prisma` no reflejaba la gamificación del compañero (cursos IA +
clanes). **Ya está todo reflejado** en el schema (cursos: `MealDbCourse`, `UserMealDbCourse`,
`UserMealDbLesson`, `UserStats`, `Badge`, `UserBadge`, `MissionPool`, `UserMission`; clanes:
`Clan`, `ClanMember`, `ClanRequest`, `ClanMission`, `ClanMessage`, `ClanMessageReaction`;
+ `nivel`/`xpTotal` en User). Todas esas tablas YA existían en la DB con datos (seed de
Badge/MissionPool, clanes de prueba) — solo se añadieron al schema para tipar el cliente.
- **Igual NO usar `prisma db push --accept-data-loss`** sin revisar: si el schema queda
  desincronizado de la DB real, podría DROPear datos. Para cambios de DB: SQL dirigido vía
  `npx prisma db execute --schema prisma/schema.prisma --file <archivo.sql>`, con los nombres
  exactos que genera Prisma. Los SQL manuales viven en `prisma/manual/`.

## 🗓️ Planificador Semanal (PRO/CHEF)
- Tabla nueva `MealPlanEntry` (creada vía `prisma/manual/add_meal_plan_entry.sql`).
- Endpoints en `recipes.controller.ts` (todos PRO/CHEF → `403 PRO_ONLY`):
  `GET/POST /recipes/meal-plan`, `POST /recipes/meal-plan/generate`,
  `POST /recipes/meal-plan/:id/prepare`, `PATCH`/`DELETE /recipes/meal-plan/:id`.
- Modelo de costo: `generate` = 1 llamada barata (solo títulos, no toca límite);
  `prepare` genera la Recipe completa bajo demanda reutilizando `generateRecipe`.
- **Preferencias nutricionales del sheet (2026-07-03):** "Customize your week" ahora tiene
  **meta de calorías por comida** (`calorieGoal`: light <450 / balanced 450-650 / hearty 650+
  kcal por porción), **objetivos nutricionales** multi-select (`nutritionGoals`: protein |
  low_carb | low_fat | low_sodium — 'protein' salió del focus) y **porciones** (`servings`:
  1|2|4). Rangos/labels compartidos en `CALORIE_GOAL_RANGES`/`NUTRITION_GOAL_LABELS`
  (openai.service). Se sanitizan con whitelist (`sanitizePlanPrefs`) y se guardan como
  **snapshot en `MealPlanEntry.prefs Json?`** (SQL `prisma/manual/add_meal_plan_prefs.sql`,
  ya aplicado) → el **`prepare` los inyecta como hints** en el mensaje (`(calorie target: ...)`,
  `(nutrition goals: ...)`, `(servings: N)`) y `generarReceta` tiene la instrucción de
  honrarlos → la Recipe completa (y su panel de nutrición) respeta lo planeado. El swap de
  `moveMealPlanSlot` también copia `prefs`. Frontend: `MenuPreferencesSheet` (3 secciones
  nuevas), i18n `planner.q_calories|q_nutrition|q_servings` + `calorie_opts|nutrition_opts|
  servings_opts`.
- **⚠️ Fix cache (2026-07-03):** `CacheService.lookup` ahora hace **skipCache si no hay
  ingredientes explícitos**: la clave es solo `(mealType, ingredients, timeBand)`, así que con
  `ingredients=[]` dos peticiones de texto libre distintas (o dos `prepare` del planificador)
  colisionaban en la misma clave y la 2ª habría recibido una receta que no pidió (y sin sus
  hints de kcal). Verificado en DB: solo había 2 filas genéricas con `timesServed=0` (nunca
  llegó a servir mal). El cache `GlobalRecipe` queda SOLO para el flujo con
  `(use these ingredients: ...)` (fridge/sugerencias).
- **⚡ Perf de carga (2026-07-03):** backend: `getMealPlan` hace el gate PRO + `findMany` en
  **paralelo** (1 ola de ~155ms en vez de 2). Frontend: **caché stale-while-revalidate del plan**
  en `api.ts` (`getCachedMealPlan`/`cacheMealPlan`, memoria + localStorage `savora.mealplan.cache`,
  clave = `weekStart`, retiene 4 semanas) → el planner **pinta al instante sin LoadingScreen** al
  volver y revalida en 2º plano; navegar a una semana ya vista también pinta del caché. El perfil
  inicial sale de `getCachedProfile()`. Añadir un plato hace **parche local** con la respuesta del
  POST (antes recargaba la semana entera con spinner). Se limpia en login/logout vía
  `clearCachedProfile` → `clearMealPlanCache` (no mezclar usuarios).

## 🛒 Mercado + PantryCheck (2026-07-12 — rediseño del flujo "Help me decide")
- **Flujo guiado nuevo:** RecipeStart → TimeSelect → MealTypeSelect → **PantryCheck** (reemplazó a
  RecipeMode; FridgeAnalyzer se absorbió y su página se borró) → **RecipeSuggestions** (listado para
  ELEGIR el plato) → elegir → Recipes auto-genera (consume FREE=3 como siempre) → Modo Cocina.
- **Despensa (`User.pantry Json?` = string[], todos los planes):** se edita en PantryCheck (chips
  editables: texto o foto de nevera vía `analyze-fridge`) y se guarda vía `PUT /users/profile`
  (sanitización en `users.service.updateProfile`: trim, dedup case-insensitive, máx 60×40 chars).
  Se precarga la próxima vez. `analizarFridge`/`analizarFridgeTexto` ahora devuelven **6 sugerencias**
  (antes 3; `max_tokens` subidos a 1300/1200).
- **My Kitchen (frontend `/kitchen`, todos los planes):** la MISMA `User.pantry` como cocina ilustrada
  interactiva (escena SVG: nevera/alacena/cajón clicables) + **`User.utensils Json?`** (string[], cajón
  de utensilios; SQL `prisma/manual/add_kitchen_utensils.sql`, ya aplicado; misma sanitización que
  pantry vía `sanitizeList`). Autosave por `PUT /users/profile`. Al "Clear purchased" del mercado, el
  front ofrece sumar los comprados a la despensa (comprado→cocina).
- **Mercado (GRATIS, todos los planes desde 2026-07-13 — ver más abajo):** tabla **`MarketItem`**
  (`name`, `quantity?`, `note?`, `priceCents?`, `priceSource?` 'ai'|'manual', `checked`,
  `recipeTitle?`, `imageUrl?` OBSOLETO=siempre null; SQL base `add_market_pantry.sql`,
  `note` vía `add_market_note_drop_catalog.sql`; también existe `User.pantry`/`User.zipCode`).
  Módulo `market/` = solo `MarketController` + `MarketService` (+ Prisma/OpenAI/AiUsage).
- **⚠️ REDISEÑO (2026-07-13) — "hazlo simple": comida genérica + emoji + nota + precio IA.**
  Se **eliminó por completo** la etapa de buscador de productos reales (Kroger + Open Food Facts +
  catálogo propio sembrado). Motivo del usuario: las **fotos cargaban lento** y OFF/Kroger traían
  **productos raros/de baja calidad**; prefirió una lista de compras limpia de comida SIN marcas.
  Borrados: `kroger.service.ts`(+spec), `off.service.ts`(+spec), `catalog.service.ts`,
  `scripts/seed-market-catalog.js`; **DROP** de la tabla `MarketCatalogItem` (se había sembrado
  ~3.6k productos de OFF — ya no existe); endpoint `GET /market/search` **quitado** (404).
  `OpenaiService.isFoodItem` quedó en el código pero **ya no se usa** (dormido).
- **Cómo funciona ahora:** el **buscador vive en el FRONTEND** (`Frontend/src/data/foods.ts`: ~350
  comidas genéricas categorizadas con emoji; filtro por tokens client-side, **instantáneo, cero API**).
  El usuario toca una comida (o escribe la suya → "Add «texto»") → `POST /market/items { name, note? }`
  crea la fila. **Nota opcional por ítem** (p.ej. preferencia de marca "Oatly") editable inline.
  **El emoji** se deriva del nombre en el front (`foodEmoji`: match exacto de la lista → keyword →
  🛒). Sin fotos.
- **Precio = SOLO estimación IA** (se quitó Kroger). `MarketService.aiPrices(user, names)` =
  `openai.estimarPrecios` (gpt-4.1-mini temp 0, 1 llamada batch ≤40 ítems, `normalizePrices` clampa
  $0.10–$150 → centavos, spec `src/ai/prices.spec.ts`). Cuenta en el **presupuesto diario de IA**
  (`AiUsageService`; 429 `DAILY_LIMIT_REACHED` se propaga; cualquier otro fallo → fail-open: ítem sin
  precio). El front **auto-estima** (debounced 1.2s) al añadir un ítem sin precio; botón "Estimate
  prices" de respaldo. `priceSource='manual'` si el usuario pone precio a mano vía PATCH.
- **Endpoints** (`/api/market`, JwtAuthGuard + ThrottlerGuard; generate/estimate 10/min):
  `GET /market`, `POST /market/items { name, quantity?, note? }`, `PATCH /market/items/:id`
  (`name?/quantity?/note?/priceCents?/checked?`), `DELETE /market/items/:id`, `DELETE /market/checked`,
  `POST /market/generate { items[{name,quantity?,recipeTitle?}] }` (flujo "faltantes de receta":
  crea deduplicado + precio IA), `POST /market/estimate` (precio IN-PLACE a los sin precio).
- **🆓 Mercado GRATIS para todos los planes (2026-07-13):** se quitó el gate PRO/CHEF —
  `assertPaidUser` ya NO llama a `isPaid()`, solo verifica que el usuario exista (404 si no).
  Motivo de producto: el flujo "Help me decide" va a ofrecer "cocinar con lo que tengo en
  My Kitchen" vs. "cualquier receta, compra lo que falte" (ver `RecipeSuggestions.tsx`), y esa
  segunda opción manda los faltantes al mercado automáticamente — necesitaba estar disponible
  para FREE también. **Frontend:** ruta `/market` sin `PlanGate`, sin candado PRO en la tarjeta
  del Dashboard, y el sheet "add missing to market" en `RecipeSuggestions.tsx` ya no chequea
  `plan` (se quitó `isPaidPlan`/el fetch de perfil que solo servía para eso). El nombre del
  método `assertPaidUser` se mantuvo (solo cambió su cuerpo) para no tocar las ~10 llamadas.
- **Specs:** `market.service.spec.ts` (sin gate de plan — FREE y PRO se comportan igual, 404 si
  el usuario no existe, ownership, nota, dedup, 429 antes de OpenAI, fail-open, estimate
  in-place) — patrón `new Service(mocks)` sin red/DB. Verificado E2E en vivo (antes del cambio a
  gratis): add con nota (201) → estimate IA ($3.50 oat milk) → `/search` 404 → PATCH nota (200)
  → delete (200).
- **Vestigios:** `User.zipCode` (Profile) y las keys `KROGER_*` del `.env` quedan pero **ya no se
  usan** (el mercado no consulta Kroger). Se pueden quitar cuando se limpie el Profile.

## 📋 Waitlist de pre-lanzamiento (2026-07-13, pública sin auth)
- **Qué es:** registro con email en `savoracook.com/waitlist` → posición en la fila + código de
  referido propio; cada amigo que se registra con tu link te sube. Incentivos: Top 100 = 6 meses
  Pro, Top 500 = 3 meses, resto = 30 días.
- **Tabla `WaitlistEntry`** (SQL `prisma/manual/add_waitlist.sql`, ya aplicado): email/referralCode
  únicos, `referredBy`, `referralCount`, `confirmedAt` (reservado doble opt-in), `unsubscribed`.
  **La posición NO se guarda** — se calcula on-the-fly: `1 + count(más referidos, o mismos
  referidos pero registrado antes)` = ORDER BY referralCount DESC, createdAt ASC (índice
  compuesto para eso). Así los referidos "te suben" sin reordenar filas.
- **Módulo `waitlist/`** (controller + service; `EmailService` proveído directo — AuthModule no
  lo exporta y no tiene deps). Endpoints (`/api/waitlist`):
  - `POST /waitlist { email, referredByCode? }` — público, **throttle 3/hora por IP** (anti-spam) +
    blocklist de ~19 dominios de email desechables (400 `DISPOSABLE_EMAIL`). Ya registrado → **409
    `ALREADY_REGISTERED` con su posición/código actuales** (el front lo trata como éxito). Código
    de referido inválido → se ignora en silencio. Responde `{ position, referralCode, totalSignups }`
    y dispara el **Email 1** (confirmación + posición + link, fire-and-forget).
  - `GET /waitlist/:referralCode` — estado actualizado `{ position, referralCount, totalSignups }`.
  - `GET /waitlist/stats` — SOLO admins (JwtAuthGuard + AdminGuard, declarado ANTES de `:code`):
    total, registros/día (14d, $queryRaw con ::int para evitar BigInt) y top 10 referentes.
- **Código de referido:** 8 chars, alfabeto sin 0/O/1/I, `crypto.randomBytes` (⚠️ NO nanoid: no
  está en deps y su v4+ es ESM-only → rompe el build CommonJS de Nest). Reintenta ante colisión;
  P2002 en email (doble submit) → reentra y cae en el 409.
- **Email:** `EmailService.sendWaitlistWelcomeEmail` — mismo patrón dev-mode (sin
  `EMAIL_ENABLED=true` solo loguea el link a consola). Los **emails 2-5 de la secuencia (día 3,
  semana 2, semana 4, pre-lanzamiento) quedan PENDIENTES** (cron con @nestjs/schedule, el plan
  los permite post-lanzamiento del form).
- **Specs:** `waitlist.service.spec.ts` (8) — registro+email, desechables, 409 con posición,
  referido válido/inválido, cálculo de posición, 404, fallo de Resend no rompe. Verificado E2E en
  vivo: A→pos 1, B→pos 2, C con ref de B → B sube a pos 1 y A baja a 2, `referredBy` persistido,
  404 en código inválido.
- **Frontend:** página pública `/waitlist` (sin ProtectedRoute, lazy). Guarda el código propio en
  `localStorage['savora.waitlist.code']` → al volver muestra el estado actualizado (GET) en vez del
  form. Detecta `?ref=` y lo manda en el submit. `navigator.share` con fallback a copiar. i18n `waitlist.*`.

## 🌐 Red Social (los 3 planes, sin límite)
- Feed de publicaciones: cada post es una **foto** (`type='PHOTO'`) o una **receta propia
  compartida** (`type='RECIPE'`, con `recipeId` → Recipe del usuario). Tablas nuevas
  `SocialPost` y `SocialLike` (creadas vía `prisma/manual/add_social.sql`).
- **NO** gatea por plan ni consume el límite FREE: solo requiere `JwtAuthGuard`.
- **Imágenes en Supabase Storage** (bucket público `social`), NO base64 en la DB:
  el frontend manda base64, `SupabaseStorageService.uploadPostImage()` lo sube y guarda
  solo la URL pública en `SocialPost.imageUrl`. Al borrar el post se borra la imagen.
- `likeCount` es un contador denormalizado (se ajusta en la misma `$transaction` que el
  like) → el **Top 3 del día** es un `ORDER BY likeCount DESC` barato sobre posts de hoy,
  separado en fotos y recetas.
- Endpoints en `social.controller.ts`: `POST /social/posts`, `GET /social/feed` (cursor),
  `GET /social/top`, `POST /social/posts/:id/like` (toggle), `DELETE /social/posts/:id`,
  + moderación: `POST /social/posts/:id/report`, `POST /social/users/:userId/report`,
  `POST`/`DELETE /social/users/:userId/block`, `GET /social/blocked` (ver sección Moderación).
- **Moderación de imágenes (NUEVO):** `createPost` sube la foto y la pasa por
  `OpenaiService.moderateImage` (mismo path que el chat de clanes: NSFW/sexual, violencia
  gráfica, autolesión; umbral alto para no marcar comida). Si se marca → **borra la imagen
  subida** y lanza `INAPPROPRIATE_IMAGE` (frontend: `social.image_rejected`). Fail-open ante
  error de la API. `SocialModule` importa `OpenaiModule`.
- **🧹 Feed EFÍMERO — retención 15 días (2026-07-05):** los posts viven `SOCIAL_RETENTION_DAYS`
  (env opcional, default **15**) y un cron diario (`purgeOldPosts`, 4:15 UTC) borra en lotes de 500
  la **imagen del bucket + la fila** (likes por cascade; `Report.postId` no tiene FK → no rompe el
  panel de moderación). Decisión de producto: publicaciones nuevas reemplazan a las viejas → el
  Storage (1GB free) no crece sin límite. **Insignias de likes protegidas:** ya NO suman el
  `likeCount` de los posts vivos — leen **`User.likesReceivedTotal`** (contador DE POR VIDA, con
  backfill en `prisma/manual/add_social_retention.sql`, ya aplicado) que `toggleLike` mantiene en
  la misma `$transaction` (sube al like, baja al unlike, NO baja al purgar). `badges.service` usa
  `max(contador, aggregate)`. Specs en `social.service.spec.ts`.
- **Env nuevas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role, server-side),
  `SOCIAL_RETENTION_DAYS` (opcional, default 15).
  Requiere bucket público `social` creado en el dashboard de Supabase.

## 🎓 Cursos = ROADMAP POR CATEGORÍA (`courses-ai`) — TODOS los planes, con topes
**Rediseñado 2026-07-02** (memoria [[cooking-roadmap]]). Antes: catálogo per-receta CHEF-only. Ahora:
**cada categoría es su propio roadmap** (camino tipo mapa) y el acceso es de **todos los planes**.
- **Modelo:** `/courses` = elegir categoría → `/courses/:category` = el **roadmap de esa categoría** (sus
  recetas reales, **capadas a 12**, + nodos de **habilidad** curados **INTERCALADOS**) →
  `/courses/:category/:idMeal` = jugar el nodo (syllabus IA de 5 lecciones cacheado en `MealDbCourse` →
  lecciones paso a paso con voz → foto + feedback gpt-4o → completar → XP/insignias/misiones). Desbloqueo
  **secuencial** por nodo (completed/current/locked).
- **Nodos:** receta → idMeal real (o `d_<id>` bebidas de TheCocktailDB); habilidad → id **`path_<key>`**
  generada por IA desde un `seed` curado. Config en `src/courses-ai/roadmap.config.ts` (`CATEGORY_ROADMAP`:
  color + `skills[]` por categoría, cada skill con `pos` = tras cuántas recetas se intercala).
- **Categorías:** se quitaron **Goat/Lamb**, se fusionó **Side+Starter → `SidesStarters`**, y se añadieron
  **`Cocktail`/`Juice`** desde **TheCocktailDB** (`filter.php?c=Cocktail` / `?a=Non_Alcoholic`).
- **Acceso + topes de USO (ver [[plan-tiers-gating]]):** TODO `courses-ai` es **solo `JwtAuthGuard`** (se
  quitó `ChefGuard`). El plan limita el uso, no el acceso: `COURSE_LIMITS` (**FREE=3 lecciones, PRO=3 cursos,
  CHEF=∞**), de por vida y GLOBAL; enforcement en `completeLesson` (`LESSON_LIMIT_REACHED`) y `completeCourse`
  (`COURSE_LIMIT_REACHED`). `/progress` + stats + insignias abiertos a todos. Frontend: **locking proactivo**
  del nodo actual + CTA **Upgrade** (placeholder → `/profile` hasta RevenueCat).
- **Pasos con tip + alerta:** cada `paso` trae `tip` (siempre) + `alerta` (seguridad, SOLO si hay riesgo real:
  cuchillo, calor, agua hirviendo, carne cruda…). En los prompts de receta/bebida/técnica. `LessonSteps` los
  pinta (tip naranja, alerta ámbar ⚠️) y el **manos-libres LEE la alerta** junto al paso.
- **Generación 1-llamada (perf):** `getSyllabus`→`ensureSyllabus(idMeal, idioma)` genera **DIRECTO** en el
  idioma pedido (antes: generaba ES + traducía a EN = 2 llamadas OpenAI). ⚠️ en cursos english-only el campo
  `lecciones` (ES) queda VACÍO → usa el helper `leccionesDe(course)` donde leas contenido (aplicado en
  `completeCourse`/`chatLesson`). El front hace **prefetch** del nodo `current` al abrir el roadmap.
- **⚡ Perf cursos (2026-07-03):** (1) **caché TTL 6h en memoria de TheMealDB/TheCocktailDB**
  (`cachedExternal` en el service): antes CADA apertura de catálogo/roadmap pagaba el fetch externo
  (~200-600ms); no cachea respuestas vacías. (2) **`completeLesson` de ~8 round-trips en serie a 4
  olas** (gate en `Promise.all`, XP solo, luego count+misiones; `trackMissionProgress` va aparte
  porque `rewardMission` también da XP personal → nunca concurrente con otro awardXp del mismo user).
  (3) `checkLessonMissions` contaba lo MISMO por cada misión en el loop → 1 count; `checkCourseMissions`
  paraleliza sus counts (lecturas) y resuelve XP en serie. (4) `completeCourse`: gate completo en 1 ola
  + cierres (insignias/clan XP/misión clan) en `Promise.all`. (5) Frontend: **stale-while-revalidate**
  (`savora.courses.cache`: misiones del catálogo + roadmap por categoría) → volver al roadmap/catálogo
  pinta al instante sin LoadingScreen; se limpia en login/logout vía `clearCachedProfile`.
- **Misiones de cursos = SEMANALES y curadas (no diarias/GPT):** `missions.service` ya NO usa GPT.
  `MissionPool.fecha` = lunes 00:00 UTC; `ensureWeeklyPool` crea el `COURSE_MISSION_POOL` curado y asigna **3**
  por usuario (1 fácil/1 media/1 difícil), sin repetir las de la semana pasada (dedup por `key`). Progreso por
  SEMANA: `checkLessonMissions`/`checkCourseMissions` cuentan con `fechaCompletado >= weekStart`. Índice único
  `MissionPool(fecha, titulo)`.
- **Conexión con clanes:** `courses-ai.service` llama a `ClansService` (`addXp`, `trackMissionProgress`) al
  completar lección/curso → aporta XP al clan.
- **Endpoints** (`/api/courses-ai`, **TODOS solo `JwtAuthGuard`**): `GET /catalog?category=`,
  `GET /category-roadmap?category=`, `GET /my`, `GET /stats`, `GET /badges`, `GET /:idMeal/syllabus`,
  `GET /:idMeal/progress`, `POST /:idMeal/lessons/:n/chat|complete`, `POST /:idMeal/complete`,
  `POST /:idMeal/feedback`. (Se eliminó el `RoadmapController` intermedio: el roadmap usa el catálogo directo.)
- **Frontend:** `CoursesCatalog` (selector de categoría), `CookingRoadmap` (roadmap de la categoría, camino
  SVG serpenteante + mascota + capa decorativa), `CourseSyllabus`/`LessonSteps`/`CourseResult` (juego, modo
  idMeal, back a la categoría), `Mascot.tsx` (poses whisk/cooking/thinking, webp en `public/images/mascot/`),
  `useSpeech` (Web Speech + capa lista para plugins Capacitor iOS, ver [[courses-voice-native-ready]]). Rutas
  `/courses`, `/courses/:category`, `/courses/:category/:idMeal[/lessons/:n | /result]`. i18n `coursesAi.*`.

## 👥 Clanes (gremios) — PRO/CHEF
Integrado del trabajo del compañero (chat en tiempo real + misiones de clan + ranking).
- **Qué es:** gremios de hasta 20 miembros con roles (líder/co-líder/miembro), **chat en
  tiempo real** (gateway WebSocket namespace `/clans`, con imágenes y reacciones, moderado por
  `OpenaiService.moderateText`), misiones colectivas con IA (`@Cron` en `clans.service`),
  y ranking por XP colectivo (el XP de cursos de cada miembro suma al clan).
- **Gate:** **PRO/CHEF** vía `PaidGuard` (`clans/paid.guard.ts`) + `JwtAuthGuard` en
  `clans.controller.ts`. Frontend con `PlanGate require="paid"`. El gateway autentica por JWT
  en el handshake; el acceso real lo limita la membresía (un FREE no puede unirse → REST gateado).
- **Módulo:** `clans` (controller + service + gateway). Depende de `PrismaModule`, `JwtModule`,
  `OpenaiModule`. `clans.service` ↔ `ClansGateway` con `forwardRef` (dep circular interna).
- **Endpoints** (`/api/clans`): browse, `/mine`, crear, `/:id` (GET/PATCH), `/:id/join|leave`,
  `requests/:id/accept|reject`, `/:id/members/:userId/promote|demote|kick`, `/:id/missions`,
  `/:id/messages` (GET/POST), `/:id/messages/:msgId/react`.
- **Frontend:** `Clans`, `CreateClan`, `ClanDetail`, `ClanChat` + `services/clanSocket.ts`
  (socket.io namespace `/clans`). Rutas `/clans`, `/clans/create`, `/clans/:id`,
  `/clans/:id/chat`. Tarjeta en Dashboard (candado PRO). i18n namespace `clans.*`.
- **Moderación de nombre/descripción:** al crear/editar clan, `clans.service.isOffensiveText`
  bloquea lenguaje ofensivo (wordlist ES/EN por token normalizado + `OpenaiService.moderateText`,
  fail-open). Errores `CLAN_NAME_OFFENSIVE` / `CLAN_DESC_OFFENSIVE` (mapeados en `CreateClan`).
- **Moderación de fotos del chat ("solo seguridad", NO exige que sea culinaria):** en
  `sendMessage`, si hay imagen se pasa por `OpenaiService.moderateImage` (modelo multimodal
  `omni-moderation-latest`) → bloquea NSFW/sexual, violencia gráfica y autolesión. Umbral de
  `violence/graphic` MUY alto para no marcar carne cruda. Error `INAPPROPRIATE_IMAGE` →
  `clans.chat.blocked_image`. Fail-open ante error de la API.
- **📦 Imágenes del chat → Supabase Storage (2026-07-05):** el cliente sigue mandando data-URL
  base64 por WS, pero `sendMessage` la sube al bucket `social` (prefijo `clans/<clanId>/<userId>/`)
  vía `uploadClanChatImage` y guarda **solo la URL pública** en `ClanMessage.imagenUrl` (patrón
  subir → moderar URL → borrar-si-flag, igual que social). Antes el base64 (hasta 5MB) vivía EN
  la fila → cada `getMessages` (take 50) arrastraba megas por el pooler reteniendo una conexión
  del pool de 5. Mensajes viejos con data-URL legacy siguen renderizando (`<img src>` acepta
  ambas). Solo se aceptan `data:image/*` (no hotlinks externos).
- **Ranking:** `browse` devuelve solo **Top 15** (al buscar por nombre, hasta 50 coincidencias).
- **Miembros:** en `ClanDetail` la lista de miembros se abre desde un **botón → modal**
  (portal a `document.body`), no se listan todos abajo.
- **Misiones SEMANALES (no diarias):** `clanMission.fecha` = lunes 00:00 UTC de la semana
  (`weekStartUTC`). `ensureClanMissions` genera **5** por semana (2 fáciles, 2 medias, 1 difícil)
  del `CLAN_MISSION_POOL`, **distintas entre sí** y **excluyendo las `key` de la semana pasada**
  (selección determinista por clan+semana). Metas realistas para 7 días (lecciones ≤70, cursos ≤4).
  Índice único `(clanId, fecha, titulo)` + `skipDuplicates` evita duplicados por carrera
  (SQL en `prisma/manual/add_clan_mission_unique.sql`). Las misiones diarias viejas (sin `key`)
  se limpiaron de la DB.
- **🌐 Texto en INGLÉS (app inglés-only):** el `titulo`/`descripcion` de las misiones se guardan en
  **español en la DB** (los pools `CLAN_MISSION_POOL`/`COURSE_MISSION_POOL` están en español), pero el
  **frontend los traduce a inglés** sin migrar la DB: usa el `key` estable (→ `missions.titles.<key>`) y
  el `condicion` (`tipo` + `meta`/`cantidad` → `missions.clan_desc_*`/`missions.desc_*` con `{{n}}`).
  Por eso el DTO de clan ahora expone `key` (el de cursos ya devolvía `condicion` completo). Render en
  `ClanDetail.tsx` (clan) y `CoursesCatalog.tsx` (cursos). Fallback al texto ES solo si falta el `key`.

## ⭐ XP Global unificado (perfil, recetas, duelos, cursos, misiones, clanes)
- **Función central `StatsService.awardXp(userId, amount)`** ([stats.service.ts](src/stats/stats.service.ts)):
  suma `xpTotal`, **recalcula `nivel`** (`calcularNivel`) y **auto-promueve `cookingLevel`** solo hacia
  arriba (umbrales en `src/common/xp.ts`: `intermediate` nivel ≥3, `advanced` nivel ≥6; nunca baja).
  `StatsModule` es solo-Prisma → lo importan recipes/battle/clans/users sin ciclos de DI.
- **Todo el XP pasa por `awardXp`** (antes el nivel solo se recalculaba al completar curso → bug):
  cursos (`actualizarStatsPostCurso`), misiones (`checkLessonMissions`/`checkCourseMissions`),
  misiones de clan (`rewardMission`), lecciones (`LESSON_XP` solo 1ª vez), **recetas** y **duelos**.
- **Recetas (todos los planes):** al terminar el Modo Cocina, `POST /recipes/:id/cooked` setea
  `Recipe.cookedAt` (columna nueva, `prisma/manual/add_recipe_cooked.sql`) y otorga `XP.COOK_MODE`
  **una sola vez** (idempotente). Frontend: `CookingWizard` llama `markRecipeCooked` y muestra +XP.
- **Duelos (PRO/CHEF):** en los 2 cierres de `battle.service` (`finishBattle` y buffet/equipos),
  `awardBattleXp`: `XP.DUEL_PLAY` a todos + `XP.DUEL_WIN` al ganador (o al equipo ganador).
- **Montos en un solo lugar:** `src/common/xp.ts` (`COOK_MODE=25, DUEL_PLAY=20, DUEL_WIN=40, LESSON=10`;
  curso = `COURSE_BASE(45) + nivelMinimo*COURSE_PER_LEVEL(5)`). Progresión lenta a propósito.
- **El XP de clan colectivo NO cambió:** sigue viniendo solo de cursos completados (`addXp`) +
  misiones de clan. El XP personal de recetas/duelos NO suma al clan.
- **Perfil:** `users.service.findById` devuelve `nivel/xpTotal/xpForCurrentLevel/xpForNextLevel`
  (UsersModule importa StatsModule). `Profile.tsx`: tarjeta de nivel + barra de XP; el `cookingLevel`
  es **read-only** (automático) y ya no se manda en `updateProfile` (solo se elige en el onboarding).

## 💡 Tip por paso (reemplaza el tip general)
- En vez de un solo `tip` al final de la receta, ahora la IA devuelve `stepTips`: **un tip
  corto por paso**, alineado por índice a `steps` (técnica, utensilio, punto de cocción,
  mejora...). Columna nueva `Recipe.stepTips Json?` (creada vía `prisma/manual/add_step_tips.sql`).
- `openai.generarReceta` pide `stepTips` en el schema JSON y **normaliza** el array a la misma
  longitud que `steps` (rellena con '' si faltan); ya **no** emite el `tip` general (`delete recipe.tip`).
- **Backward-compat:** recetas antiguas (y recetas cacheadas en `GlobalRecipe` previas al cambio)
  tienen `stepTips` NULL/[] pero conservan su `tip` general → el frontend lo muestra como
  **fallback** sólo si no hay ningún tip por paso. Se propaga en generate, daily (las 3 ramas) y
  duelos (buffet/equipos/ingredientes → historial). Frontend: `RecipeCard` (tip bajo cada paso) y
  `CookingWizard` (tip en cada pantalla de paso).

## 🔥 Contador de calorías / nutrición por receta (2026-07-03)
- La IA devuelve **nutrición estimada POR PORCIÓN** al generar: `Recipe.nutrition Json?` =
  `{ servings, calories, protein, carbs, fat, vitaminC, calcium, iron, sodium }` (macros en
  kcal/g, micros en mg y **null-ables**; columna vía `prisma/manual/add_nutrition.sql`).
- **Aplica a:** generate desde cero, receta del día (peek + prepare, viaja dentro de
  `DailyRecipe.recipeData`) y planificador semanal (el `prepare` reusa `generateRecipe`).
  **NO aplica a duelos** (`battle.toRecipeData` hace whitelist y la descarta solo) **ni cursos**
  (prompts propios).
- `openai.generarReceta`: el schema JSON pide `servings` + `nutrition`; `normalizeNutrition`
  (con spec en `src/ai/nutrition.spec.ts`) valida números, redondea, clampa `servings` a [1,12]
  y **devuelve null si no hay calorías fiables** → el frontend oculta la sección.
- **Backward-compat:** recetas antiguas y cacheadas (`GlobalRecipe`/`DailyRecipe` previas) tienen
  `nutrition` NULL → no se muestra nada, sin fallback.
- **Frontend:** `RecipeCard` (chip `X kcal` en el header + panel Nutrition: **anillos
  concéntricos SVG** kcal/protein/carbs/fat con % del valor diario de referencia (FDA, 2.000
  kcal), fila etiquetada con medidor por macro, grid "Micro & key nutrients" con % DV, y
  footnote de estimación IA) y `Dashboard` (chip kcal en el banner de la receta del día).
  Colores dataviz en `savora-ui.css` (`--viz-kcal/protein/carbs/fat/track`, validados CVD +
  contraste sobre la crema clara y el tema oscuro). `RecipeDetail`/`Recipes` propagan
  `nutrition` al card. De paso, `RecipeCard` (que estaba hardcodeada en español) se migró
  ENTERA a i18n (`recipes.*` en en.json, app inglés-only).
- **El resumen de la receta ya NO muestra los pasos** (2026-07-03): la sección Steps se quitó
  de `RecipeCard`; los pasos (+ tips por paso) solo se ven en el **Modo Cocina** (`CookingWizard`).
  El `tip` general de recetas antiguas se conserva como bloque suelto en el resumen.

## 🏅 Insignias / Logros (todos los planes)
- **Sistema ampliado y sacado del candado CHEF.** Antes las 8 insignias eran solo de cursos y
  solo se veían en `GET /courses-ai/badges` (CHEF). Ahora hay un endpoint **`GET /badges`**
  ([badges.controller.ts](src/badges/badges.controller.ts), solo `JwtAuthGuard`, los 3 planes) y
  una página dedicada `/achievements` que muestra **TODAS** (ganadas y pendientes), agrupadas por
  categoría.
- **Catálogo único en código** (`BADGE_CATALOG` en [badges.service.ts](src/badges/badges.service.ts)):
  cada insignia tiene `categoria` ('receta'|'duelo'|'clan'|'social'|'curso'|'general'), `requiredPlan`
  (PRO/CHEF/null, **solo informativo** para el chip del front) y `tipo` (cómo se mide el progreso).
  `ensureBadgeCatalog()` upsert-ea el catálogo a la tabla `Badge` (FK de UserBadge) **una vez por
  proceso** → añadir una insignia = añadir una entrada al array (+ rama en `verificarInsignias` si
  el `tipo` es nuevo), **sin SQL manual**.
- **Insignias (~33), por `tipo`:** recetas (`recipeCount` generar 10/50/100, `cookedCount` Modo
  Cocina 10/25/50, `favoriteCount` 10/25 — todos los planes); duelos (`duelsWon` ganar 10/25/50,
  `duelsPlayed` jugar 10/25 — PRO/CHEF); social (`postsCount` 1er post, `likesReceived` 50/100 —
  todos, suma `SocialPost.likeCount`); clan (`clanLider` + `clanTopRank` Top 10/3/1 global por
  `xpColectivoTotal` — PRO/CHEF); general (`streak` 7/30/100, `nivel` 5/10/15/20); cursos (las 8
  CHEF). Columnas nuevas `Badge.categoria`, `User.duelsWon`/`duelsPlayed`
  (`prisma/manual/add_badges_achievements.sql`).
- **Recompute al abrir la página:** `getAllForUser` recalcula y devuelve todas, así no hay que
  cablear `BadgesService` en cada módulo. Lo único cableado es el contador: `duelsWon`/`duelsPlayed`
  se incrementan en `battle.service.awardBattleXp` al cerrar el duelo. Una insignia ya `completada`
  nunca se revierte.
- **⚡ Rendimiento (importante — la página tardaba ~7s):** `BadgesService` se reescribió porque
  cada apertura era lentísima. Tres causas y sus fixes:
  1. **`ensureBadgeCatalog` hacía 33 `upsert` SECUENCIALES en la 1ª petición tras cada arranque**
     (~7s). Ahora se ejecuta **al boot** (`OnModuleInit`) y **en paralelo** → la 1ª carga del
     usuario ya no lo paga.
  2. **`verificarInsignias` hacía un `UPDATE` por insignia en serie** (hasta 33 round-trips) en
     CADA apertura aunque nada cambiara. Ahora un único `recompute(userId)` lee todo en 1 lote
     paralelo y **solo escribe lo que cambió** (al reabrir sin cambios → 0 writes).
  3. **`getAllForUser` duplicaba el trabajo** (recompute + 2 `findMany` extra de `getUserBadges`).
     Ahora reusa el mismo `recompute`. Y se bajó de 10 a 7 queries (3 cuentas de Recipe → 1 raw,
     posts+likes → 1 aggregate) por el `connection_limit=5` del pooler (cada query es una "ola").
  - El pooler de Supabase está capado a **15 conexiones totales** (`EMAXCONNSESSION` si se pasa);
    cada query a us-west-2 cuesta ~150ms de RTT → el recompute en caliente queda en ~300-450ms.
  - **Caché frontend (stale-while-revalidate):** `api.getBadges()` cachea en memoria + `localStorage`
    (`getCachedBadges`); `Profile` y `Achievements` pintan al instante lo último conocido y revalidan
    en 2º plano (ya no hay `LoadingScreen` viniendo del perfil). Se limpia en login/logout
    (`clearCachedProfile` → `clearBadgesCache`) para no mezclar usuarios.
  - **Pool warm app-wide:** `PrismaService` pre-calienta el pool al boot y lo mantiene con un
    keepalive (`SELECT 1` cada 60s) → menos arranques en frío en TODAS las pantallas, no solo badges.
- **Frontend:** [Achievements.tsx](Frontend/src/pages/Achievements.tsx) (ruta `/achievements`),
  acceso desde `Profile.tsx` (tarjeta-botón con "X de Y"), `api.getBadges()`. Textos por i18n
  `badges.items.<id>.name/desc` (fallback al `nombre`/`descripcion` del server) + `achievements.*`.

## 👥 Amigos + Perfiles públicos (todos los planes)
- **@username único** (`User.username`, regex `^[a-z0-9_]{3,20}$`): backfill de usuarios viejos
  (`scripts/backfill_usernames.js`) y **autogenerado en el registro** (`UsersService.generateUniqueUsername`
  dentro de `createUser`) → nadie queda sin handle. Editable en `Profile` (errores `USERNAME_INVALID`/
  `USERNAME_TAKEN`). Modelo `Friendship` (`requesterId`/`addresseeId`/`status` pending|accepted,
  `@@unique`) — SQL en `prisma/manual/add_friends_username.sql`.
- **Perfil público** `GET /users/u/:username` (JwtAuthGuard, los 3 planes): name, nivel, XP, insignias
  **ganadas**, clan {id,nombre,avatarUrl,rol}, estado de amistad, isSelf. + `GET /users/search?q=` y
  `GET /users/username-available?u=`. `UsersModule` importa `BadgesModule` + `FriendsModule`.
- **FriendsModule** (solo-Prisma): `/api/friends` (list), `/requests` (entrantes), `/counts`,
  `POST /request` (por username o userId; auto-acepta la inversa pendiente), `/requests/:id/accept|reject`,
  `DELETE /:userId`. `getStatus` → none|request_sent|request_received|friends|self.
- **Clicables:** `username` añadido al autor del post (`social.service.toDto`) y a los miembros de clan
  (`clans.service` `USER_SELECT` + `getDetail`). Frontend: `PostCard` y `ClanDetail` navegan a `/u/:username`.
- **Frontend:** página `PublicProfile` (`/u/:username`), pestaña **Amigos** en `Social` (segmented Feed/Amigos
  + `FriendsPanel`: buscar, solicitudes, lista), editor de @username en `Profile`, insignias bajo el nombre.
  i18n `friends.*` / `publicProfile.*` / `social.tab_*` / `profile.username_*`.

## 🔑 Recuperación de contraseña (todos los planes)
- **Columnas nuevas** `User.resetToken` (único) + `User.resetTokenExpiry`
  (SQL en `prisma/manual/add_password_reset.sql`).
- **`POST /auth/forgot-password { email }`**: SIEMPRE devuelve el mismo mensaje genérico
  (anti-enumeración de emails). Si el email existe, genera `resetToken`
  (`crypto.randomBytes(32).hex`, caduca en **1h**) y manda el correo vía Resend
  (`EmailService.sendPasswordResetEmail` → enlaza a `${FRONTEND_URL}/reset-password?token=`).
  Fallos de email se tragan (no se exponen al cliente).
- **`POST /auth/reset-password { token, password }`**: valida que el token exista y no haya
  caducado (`400 'El enlace es inválido o ya expiró'`), hashea bcrypt(10), limpia el token
  (**un solo uso**) y marca `isVerified: true` (recibió el correo → email validado de facto).
- **Frontend:** páginas `ForgotPassword` (`/forgot-password`) y `ResetPassword`
  (`/reset-password`, lee `?token=`), ambas **públicas** (sin `ProtectedRoute`). Enlace
  "¿Olvidaste tu contraseña?" en `Login` + banner de éxito (`?reset=1`). i18n `auth.forgot_*`/`auth.reset_*`.

## 🗑️ Borrar cuenta (Apple 5.1.1(v), todos los planes)
- **Requisito de App Store:** apps con registro DEBEN permitir borrar la cuenta in-app. Implementado como
  **soft delete + anonimización IRREVERSIBLE** (columna nueva `User.deletedAt`, SQL en
  `prisma/manual/add_account_deletion.sql`).
- **`DELETE /users/account { password }`** (`UsersService.deleteAccount`, `JwtAuthGuard`): pide la
  **contraseña actual** (reautenticación → `401 WRONG_PASSWORD` si falla). Luego:
  1. Sale del clan si pertenece a uno reutilizando `ClansService.leave` (maneja sucesión/disolución).
  2. Borra las imágenes de sus posts del bucket + los `SocialPost` (likes caen por cascade).
  3. En una `$transaction`: borra amistades, bloqueos y solicitudes de clan; **purga el contenido
     privado** (hard delete: conversaciones→mensajes por cascade, plan semanal, recetas y carpetas
     —recetas ANTES que carpetas por la FK Restrict—, y progreso/gamificación: `UserStats`,
     `UserMission`, `UserBadge`, `UserMealDbCourse/Lesson`, `UserCourse`); y **anonimiza el User**:
     `deletedAt=now`, `email='deleted_<id>@savora.deleted'` (libera el email original), `name=null`,
     `username=null` (libera el @handle), `password`=hash aleatorio, y limpia
     allergies/dietType/goal/cookingLevel/timeAvailable/pushToken/reset*/verificationToken + `isVerified=false`.
  - **Se conservan** (no son contenido privado ni PII tras anonimizar): mensajes de clan y reacciones
    (chat compartido, autor anónimo), participaciones en duelos (`CookBattlePlayer`) y likes dados
    (`SocialLike`, para no desajustar el contador de otros posts). **Idempotente** (si `deletedAt` ya
    está, devuelve `alreadyDeleted`).

## 🛡️ Panel de moderación (Apple 1.2 — actuar sobre reportes en <24h)
- **Requisito de App Store:** apps con UGC deben poder **actuar sobre el contenido reportado en <24h**
  (quitar el contenido + expulsar al usuario). Implementado con un panel de admin.
- **Columnas nuevas** `User.isAdmin`, `User.bannedAt`, `User.banReason`
  (SQL en `prisma/manual/add_admin_moderation.sql`, que además **bootstrapea** la cuenta fundadora
  como admin: `UPDATE User SET isAdmin=true WHERE email='<EMAIL_ADMIN>'`).
- **Módulo `admin/`** (`AdminGuard` consulta `isAdmin` en DB, como `ChefGuard`): controller gateado por
  `JwtAuthGuard + AdminGuard`. Importa `PrismaModule`, `StorageModule`, `ClansModule`.
- **Endpoints** (`/api/admin`, solo admins): `GET /reports?status=`, `GET /reports/count`,
  `POST /reports/:id/action { action }` (`dismiss` | `remove_content` | `ban_user`),
  `DELETE /posts/:id`, `POST /users/:id/ban { reason }`, `POST /users/:id/unban`.
- **Banear (`AdminService.banUser`)** = expulsión real: `bannedAt`, **borra sus posts+imágenes**, lo
  **saca del clan** (reusa `ClansService.leave`) y resuelve los reportes pendientes contra él. No se
  puede banear a un admin.
- **Cumplimiento del baneo:** `auth.login` rechaza con `ACCOUNT_SUSPENDED` (tras validar la contraseña,
  para no filtrar), y `social.createPost` corta a baneados/eliminados aunque tengan un JWT vivo
  (`ACCOUNT_SUSPENDED`). Igual que en el borrado, los JWT no se revocan globalmente (no acoplar auth a DB).
- **Frontend:** página `Admin` (`/admin`, auto-gateada por `profile.isAdmin` → si no, redirige); lista
  reportes con preview del post y botones Descartar / Borrar contenido / Banear (o Desbanear). Acceso
  desde una tarjeta en `Profile` que **solo aparece si `isAdmin`**.
- **Login bloqueado:** `auth.login` rechaza si `user.deletedAt` (además, email+password quedan
  irreconocibles). **Nota:** los JWT ya emitidos siguen válidos hasta caducar (no se revocan en
  `JwtStrategy` para no acoplar la auth a la DB); el frontend hace logout inmediato al borrar.
- **Módulos:** `UsersModule` ahora importa `ClansModule` + `StorageModule` (sin ciclo: ClansModule no
  importa UsersModule). **Frontend:** "Zona de peligro" en `Profile` con botón → modal que pide la
  contraseña; al borrar hace `logout()` + redirige a `/login?deleted=1`. i18n `profile.delete_*`/`auth.account_deleted`.

## 🚩 Moderación: reportes + bloqueos (red social, todos los planes)
- **Modelos nuevos** `Report` (`targetType` POST|USER, `postId?`, `reportedUserId`, `reason`,
  `status` pending|reviewed|dismissed) y `Block` (`blockerId`/`blockedId`, `@@unique`) — FK a
  User con cascade, SQL en `prisma/manual/add_moderation.sql`. Los reportes se accionan desde el
  **panel de moderación** (ver sección 🛡️).
- **Endpoints** en `social.controller.ts`: `POST /social/posts/:id/report { reason }`,
  `POST /social/users/:userId/report { reason }`, `POST`/`DELETE /social/users/:userId/block`,
  `GET /social/blocked`. No se puede reportar/bloquear a uno mismo.
- **Bloqueo = bidireccional:** `getBlockedUserIds(me)` = a quien yo bloqueé ∪ quien me bloqueó;
  `getFeed`/`getTop` excluyen sus posts con `userId: { notIn }`. Al bloquear también se
  **rompe la amistad/solicitud** (deleteMany en ambos sentidos, misma `$transaction`).
  `FriendsService.sendRequest` corta nuevas solicitudes entre bloqueados (`403 BLOCKED`).
- **Frontend:** menú **⋯** en `PostCard` (reportar con motivos + bloquear; action-sheet por
  portal porque la card es `overflow-hidden`) y botones en `PublicProfile`. Al bloquear, `Social`
  quita al instante todo el contenido del autor del feed/Top (`onAuthorBlocked`). Motivos:
  spam/inappropriate/harassment/other. i18n `social.report_*`/`social.block_*`/`publicProfile.report|block`.

## 💳 IAP / Suscripciones (RevenueCat) — backend (Apple 3.1.1)
- **Por qué:** en iOS los planes PRO/CHEF DEBEN cobrarse con el In-App Purchase de Apple (no Stripe).
  RevenueCat valida el recibo con Apple/Google y avisa al backend por **webhook**. Esto es **solo el
  backend**; la UI de compra va en el app nativo (SDK de RevenueCat) cuando exista el wrapper Capacitor.
- **Módulo `billing/`** (solo `PrismaModule`). Columna nueva `User.planExpiresAt`
  (SQL en `prisma/manual/add_billing.sql`). El plan sigue viviendo en `User.plan`; los guards
  (`PaidGuard`/`ChefGuard`) NO cambian.
- **`POST /billing/webhook`** (PÚBLICO): autenticado por el header `Authorization` ==
  `REVENUECAT_WEBHOOK_SECRET` (comparación en tiempo constante, **fail-closed** → 401). `app_user_id` =
  `User.id` (el app hace `Purchases.logIn(userId)`; ids anónimos `$RCAnonymousID:...` se ignoran). Mapea:
  eventos que **otorgan** (`INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE`/`UNCANCELLATION`/`SUBSCRIPTION_EXTENDED`/
  `NON_RENEWING_PURCHASE`) → `plan` desde `entitlement_ids` (`chef`>`pro`>FREE) + `planExpiresAt`; eventos que
  **revocan** (`EXPIRATION`/`SUBSCRIPTION_PAUSED`) → FREE; el resto (`CANCELLATION`, `BILLING_ISSUE`…) sin
  cambio (mantiene acceso hasta `EXPIRATION`). Siempre responde 200 para que RC no reintente.
- **`POST /billing/sync`** (`JwtAuthGuard`): el app lo llama tras comprar para reflejar el plan al instante;
  consulta a RevenueCat server-side (`GET /v1/subscribers/{userId}` con `REVENUECAT_API_KEY`) y setea el plan.
  Sin API key → devuelve el plan actual sin tocar nada.
- **Cron de seguridad** `@Cron('0 3 * * *') downgradeExpired()`: baja a FREE los `planExpiresAt < now` por si
  se pierde un webhook de expiración.
- **Seguridad:** el plan SOLO lo cambian el webhook (verificado) o `sync` (autoridad server-side). El cliente
  nunca puede falsearlo.
- **Env nuevas (.env):** `REVENUECAT_WEBHOOK_SECRET` (= valor del header Authorization que pones en el webhook
  de RC), `REVENUECAT_API_KEY` (para `sync`, opcional), `RC_ENTITLEMENT_PRO`/`RC_ENTITLEMENT_CHEF` (opcional,
  default `pro`/`chef`). En el dashboard de RC: crear entitlements `pro`/`chef` + apuntar el webhook a
  `https://<backend>/api/billing/webhook` con ese Authorization.

## 📜 Términos + Privacidad + aceptación (Apple UGC, solo frontend)
- **Requisito:** apps con UGC necesitan un EULA con **tolerancia cero** que el usuario acepte, y una
  Política de Privacidad accesible (App Store Connect pide una URL pública).
- **Páginas públicas** (sin auth) en el frontend: `Privacy` (`/privacy`) y `Terms` (`/terms`), con layout
  compartido `components/legal/LegalPage.tsx`. Estas mismas rutas sirven como las **URLs públicas** que
  exige App Store Connect (si el front está desplegado en savoracook.com).
- **Contenido fiel a la app:** la Privacidad declara los terceros REALES a los que se mandan datos
  (**OpenAI** recetas/chat/visión/moderación, **xAI** voz TTS, **Supabase** DB+imágenes, **Resend** emails,
  **Expo** push, **RevenueCat/Apple/Google** suscripciones), que NO hay publicidad/tracking, y el borrado de
  cuenta. Los Términos incluyen la cláusula de **cero tolerancia** (reportar/bloquear, expulsión) y el
  **disclaimer de IA/seguridad alimentaria** (recetas orientativas, verifica alergias, no es consejo médico).
  **Idioma: solo inglés** (un solo idioma, las páginas NO usan i18n — texto hardcodeado en `Privacy.tsx`/
  `Terms.tsx`; el layout `LegalPage` dice "Last updated"). Contacto fijado a `support@savoracook.com`
  (constante `CONTACT` al inicio de cada página). ⚠️ Siguen siendo **plantillas**: falta ajustar
  jurisdicción/ley aplicable y edad mínima (puse 13) antes de publicar.
- **Aceptación en el registro:** checkbox obligatorio en `Register` (enlaces a `/terms` y `/privacy` que
  abren en pestaña nueva para no perder el formulario); el botón "Crear cuenta" se deshabilita hasta marcarlo.
  Enlaces legales también en el pie de `Profile`. i18n `auth.accept_*`/`auth.terms`/`auth.privacy`.
- **✅ Aceptación SERVER-SIDE (2026-07-12):** `auth.register` exige `acceptTerms === true` en el body
  (si no → 400 `TERMS_NOT_ACCEPTED`, no se crea la cuenta ni se manda email) y `users.createUser`
  estampa **`User.termsAcceptedAt`** (columna vía `prisma/manual/add_terms_acceptance.sql`, ya aplicada;
  usuarios viejos quedan NULL). `Register.tsx` manda `acceptTerms: accepted`. Specs en `auth.service.spec.ts`.

## 🛡️ Robustez / hardening (2026-06-25, "paso 3")
Cuatro piezas de endurecimiento, todas verificadas en vivo. Deps nuevas: `@nestjs/throttler`, `@sentry/node`.

- **Rate limiting (`@nestjs/throttler`):** `ThrottlerModule.forRoot([{ ttl:60s, limit:120 }])` global en
  [app.module.ts](src/app.module.ts), pero el `ThrottlerGuard` se aplica **por controlador** (NO como
  APP_GUARD) para no romper los gateways WS. `auth.controller`: login 10/min, register 6/min,
  forgot 4/min, reset 10/min, refresh 30/min, logout 20/min. `recipes.controller`: 120/min por defecto
  + generate/analyze-fridge 20/min. `main.ts` setea `trust proxy` para la IP real tras proxy.
- **Tope diario de IA (PRO/CHEF):** columnas `User.aiUsageDate`/`aiUsageCount`
  (`prisma/manual/add_ai_usage.sql`). `recipes.service`: `assertDailyAiLimit` (lanza **429
  `DAILY_LIMIT_REACHED`** antes de llamar a OpenAI) + `bumpDailyAiUsage` (cuenta solo éxitos, reset por
  día UTC). Caps `DAILY_AI_CAP_PRO=40` / `DAILY_AI_CAP_CHEF=100`. FREE NO entra (ya topado a 3 con
  `requestsUsed`). Aplicado a: generate, daily POST, analyze-fridge, weekly-menu generate (prepare reusa
  generate → ya capado). El chat NO cuenta.
- **Filtro global de errores + Sentry:** [src/common/all-exceptions.filter.ts](src/common/all-exceptions.filter.ts)
  (`app.useGlobalFilters`): loguea consistente, reporta **5xx a Sentry** si `SENTRY_DSN` está (no-op si no),
  **preserva el shape** de los `HttpException` (el frontend lee `data.message`), y en contexto WS solo
  loguea (no responde por HTTP). Sentry se inicia en `main.ts` solo con `SENTRY_DSN`.
- **Refresh tokens (rotables/revocables):** modelo `RefreshToken` (sha256 del token, nunca en claro;
  `prisma/manual/add_refresh_tokens.sql`). Access token corto (`ACCESS_TOKEN_TTL`, default **1d**) +
  refresh largo (`REFRESH_TOKEN_TTL_DAYS`, default 30). `auth.service`: `issueTokens` (login devuelve
  `{access_token, refresh_token}`), `refresh` (rotación = revoca el usado y emite uno nuevo, **un solo
  uso**; revalida que la cuenta no esté borrada/baneada), `logout` (revoca), `@Cron` de limpieza. Endpoints
  `POST /auth/refresh` y `POST /auth/logout`. Se **revocan los refresh** al borrar cuenta
  (`users.service.deleteAccount`) y al banear (`admin.service.banUser`) → corta sesiones. `JwtStrategy`
  sigue **sin tocar la DB** (no se acopla auth a DB). **Frontend:** `api.ts` tiene `apiFetch` (drop-in de
  fetch: inyecta el access token y ante 401 refresca UNA vez —compartido entre llamadas— y reintenta; si
  falla, limpia tokens → cada pantalla hace su logout). `AuthContext` guarda/limpia `refreshToken` y llama
  `logoutApi`. Los JWT de 30d viejos siguen válidos hasta caducar (re-login una vez cuando expiren).

## 📈 Escalabilidad / load test (2026-06-27 — "¿aguanta 1000 usuarios?")
Análisis medido (no teórico) de la capacidad en el **plan free** de Supabase (subir plan se difiere hasta
tener ingresos). Detalle en la memoria `scalability-load-test`.

- **El cuello real = latencia por query, NO el pool ni los índices.** Un `SELECT 1` no-op tarda lo mismo que
  un `findMany` real → la query no cuesta, **cuesta el round-trip a la DB**. Medido desde la máquina de dev
  (LatAm → us-west-2): handshake TCP ~150ms; query por **Session pooler (5432) ~155ms** vs **Transaction
  pooler (6543, pgbouncer) ~758ms** (Supavisor en modo transacción añade ~600ms/query en free).
- **El Session pooler (config actual) es lo óptimo en free.** Probé migrar al Transaction pooler (el "fix
  pendiente" que decía la memoria vieja) y es **5x más lento** + el cap de 15 conns aplica igual → **revertido**.
  `connection_limit=5` es correcto (probé `=8` → P1001 al pasar de 15 conns). **No migrar al Transaction
  pooler hasta tener plan pago + backend co-ubicado.**
- **Load test** (Node concurrente, `GET /social/feed`, sin throttler): Session cl=5 ≈ **8 req/s**, throughput
  PLANO desde concurrencia 10 (saturado por latencia), latencia lineal, **0 errores**.
- **⚠️ El ~8 req/s es número de DEV, no de prod** — está dominado por los ~155ms laptop→Oregon. **La palanca
  de escala #1 (y gratis) es co-ubicar el backend con la DB en us-west-2** (Render/Fly/Railway/EC2 en Oregon):
  el RTT cae a ~2-5ms → la misma config haría cientos de req/s. Al desplegar, re-correr el load test desde la región.
- **Veredicto:** 1000 usuarios registrados con uso normal repartido → sí; 1000 concurrentes simultáneos → no
  en free (subir plan = sube el cap de 15 conns).
- **Índices de perf añadidos** (`prisma/manual/add_perf_indexes.sql`, también `@@index` en schema; NO requieren
  regen del cliente): `Clan(xpColectivoSemanal, xpColectivoTotal)` + `Clan(xpColectivoTotal)` (browse + rank de
  clan en badges) y `RefreshToken(expiresAt)` (purga). El resto del schema ya estaba bien indexado.
- **⚠️ DDL manual:** `prisma db execute` **falla (P1017) sobre el transaction pooler** — usar el **MCP de
  Supabase** (`execute_sql`/`apply_migration`) o el session pooler para crear índices/tablas.

## ⚡ Optimizaciones de rendimiento (2026-06-29)
- **N+1 / queries en paralelo — REGLA:** cada query cuesta ~155ms (round-trip remoto), así que el nº de
  round-trips secuenciales por request domina. **No hacer `await` dentro de loops para operaciones
  independientes** → usar `Promise.all`. Aplicado: `rewardMission` (clans.service) paraleliza el
  `awardXp` de cada miembro (antes ≤20 en serie = varios segundos al completar misión de clan);
  `completeCourse` (courses-ai.service) hace sus 3 lecturas independientes en paralelo. **Excepción:**
  mantener SECUENCIALES las mutaciones de XP del MISMO usuario (varios `awardXp` concurrentes sobre la
  misma fila → race en el recálculo de nivel). Distintos usuarios sí en paralelo.
- **Tests (`jest`, 115 verdes — `npm test`):** unit tests con el patrón `new Service(mockPrisma)` (sin DB,
  sin DI de Nest). Cubren lo crítico: webhook de billing (asignación de plan + secreto fail-closed), auth
  (gate de login verificado/baneado/borrado + rotación de refresh un-solo-uso) y límites de IA (FREE=3,
  cupo diario PRO 40/CHEF 100 → 429). **Al tocar lógica sensible nueva, añadir su spec** siguiendo ese
  patrón. Falta e2e real (necesita DB de test separada, no la de prod).

## 🧯 Hardening de concurrencia (2026-07-05 — cursos/batallas/clanes/social)
Salida del análisis "¿aguanta usuarios simultáneos?". Tres bloques, todos con spec (115 tests):

- **1) Imágenes fuera de la DB (el mayor drenaje del pool):**
  - **Duelos:** `CookBattlePlayer.photoUrl` reemplaza a `photoBase64` (SQL
    `prisma/manual/add_battle_photo_url.sql`; ⚠️ el `DROP COLUMN photoBase64` quedó PENDIENTE de OK).
    `submitPhoto` sube a Storage (`battles/<battleId>/<userId>/`) y el juez gpt-4o recibe la **URL**
    (`juzgarBatalla`/`juzgarPlatos` ahora aceptan `{ image }` URL o base64 legacy). Al cerrar el duelo
    las fotos se borran del bucket (`deleteImages`) y se limpia `photoUrl`.
  - **`buildState` con `select` EXPLÍCITO** (sin fotos/ingredients): antes el `include: players`
    completo se ejecutaba en CADA evento (join/ready/foto/countdown) y arrastraba las fotos de todos
    para luego descartarlas. El check "¿todos enviaron?" de `submitPhoto` también usa select mínimo.
  - **Chat de clanes → Storage** (ver sección 👥 Clanes): `ClanMessage.imagenUrl` = URL pública.
- **2) Freno de IA fuera de recipes (`AiUsageService`, `src/ai/ai-usage.service.ts` + módulo solo-Prisma):**
  mismo contador `User.aiUsageDate/aiUsageCount` que recipes (un solo presupuesto diario) pero con
  **cap para FREE=25** (PRO 40 / CHEF 100). Aplica a **generación de syllabus** (solo cache-miss; con
  **lock anti-duplicado** `syllabusLocks` — dos usuarios al mismo curso no cacheado = 1 llamada) y a
  **feedback gpt-4o** de cursos. El **chat NO cuenta** (regla de producto) → se frena con throttle:
  `courses-ai` (syllabus 12/min, chat 20/min, feedback 6/min + 120/min default), `clans` (create 6/min,
  messages 30/min), `social` (posts/reports 10/min), `battle` (default). **WS**: `wsRateAllow`
  (`src/common/ws-rate-limit.ts`, ventana deslizante por socket) — clanes sendMessage 15/30s y react
  30/30s (`chatError RATE_LIMITED`), duelos askChef 8/min y submitPhoto 4/min.
- **3) Carreras corregidas (anti XP doble):**
  - `clans.trackMissionProgress`: era read-modify-write → progreso perdido y `rewardMission` DOBLE si
    dos miembros cruzaban la meta a la vez. Ahora `increment` atómico + cierre con
    `updateMany({ completada:false, progresoActual:{gte:meta} })` → solo `count===1` reparte premio.
  - `battle.judgeBattle`: la última foto y el timer podían juzgar los dos (doble gpt-4o + doble
    `awardBattleXp`). Ahora transición atómica `updateMany({ status:'cooking' } → 'judging')` y solo
    quien gana sigue; re-entrar con status `judging` solo con `{ recovery:true }` (onModuleInit).
- **4) Datos efímeros (anti-llenado de DB/Storage, mismo día):** el TTS ya **no persiste audio en la
  DB** — caché en memoria TTL 6h + LRU 60 en `tts.service` (cada mp3 ~150-200KB en `bytea` habría
  llenado los 500MB free con el TTS activo); el modelo `TtsCache` salió del schema y su `DROP TABLE`
  quedó pendiente de OK (`prisma/manual/drop_tts_cache.sql`). Y el **feed social es efímero**
  (retención 15 días + contador de likes de por vida — ver sección 🌐 Red Social).
- **Quedó anotado para después (prioridad 4 del análisis):** estampida de reconexión WS tras restart
  (1 query por handshake de clanes), checks de capacidad check-then-act (sala >4, clan >20, topes FREE
  en paralelo) y el pico de `rewardMission` (≤20 awardXp paralelos contra pool de 5).

@.claude/backend-skill.md