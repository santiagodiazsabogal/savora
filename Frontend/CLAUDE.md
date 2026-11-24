# Savora — Frontend (React + Vite)

## Qué es esto
Frontend de Savora, una app de generación de recetas con IA para Gen Z. Stack: React + Vite + TypeScript + Tailwind CSS + react-i18next.

## Stack
- **Framework:** React 18 + Vite
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS (solo clases utilitarias base, sin compilador custom)
- **Routing:** react-router-dom v6
- **i18n:** react-i18next + i18next-browser-languagedetector
- **Íconos:** lucide-react
- **Entorno:** Windows / PowerShell

## Estructura de carpetas
```
src/
  pages/
    Login.tsx
    Register.tsx
    Dashboard.tsx         → página principal con receta del día
    TimeSelect.tsx        → paso 1: elegir tiempo disponible
    MealTypeSelect.tsx    → paso 2: elegir tipo de comida (grid 2x2)
    PantryCheck.tsx       → paso 3 (2026-07-13 REDISEÑADO): ELECCIÓN de punto de partida — dos tarjetas:
                            A) "Cook with what I have" → usa My Kitchen (User.pantry); vacío → empuja a /kitchen;
                            con items → RecipeSuggestions con ingredients=pantry. B) "Any recipe" → RecipeSuggestions
                            con ingredients=[] (sugerencias libres, cada una con missingIngredients → sheet mercado).
                            Ya NO edita chips ni sube fotos (eso vive en My Kitchen). mode:'have'|'shop' viaja en state.
    RecipeSuggestions.tsx → paso 4: listado de recetas para ELEGIR (6 con ingredientes / 4 genéricas, AMBAS con
                            missingIngredients → al elegir con faltantes, sheet "add missing to market" gratis)
    Recipes.tsx           → generador de recetas (auto-genera con prefillQuery → cook mode)
    Market.tsx            → 🛒 lista de compras: buscador de comida genérica (data/foods.ts) + emoji +
                            nota de marca + precio IA (gratis, todos los planes)
    Kitchen.tsx           → 🥘 My Kitchen: escena SVG ilustrada INTERACTIVA (components/kitchen/KitchenScene.tsx).
                            Nevera/alacena/cajón se "abren" con una animación de puerta que gira sobre su bisagra
                            (fake-3D vía scaleX+skewY desde el punto de la bisagra — vive DENTRO del viewBox, así
                            que escala perfecto en cualquier ancho real; ⚠️ se intentó una versión con CSS 3D real
                            (perspective+preserve-3d) y salía desalineada/con hueco muerto en el celular real
                            —ver [[kitchen-3d-scene-reverted]]—, revertida a este enfoque plano), "peek" al pasar
                            el puntero, glow al abrir, chispa ✨ al seleccionar. Ventana con **día/noche/atardecer
                            reales** según la hora del dispositivo (`skyPhase()`, refresco cada 5min). Los ítems
                            REALES del usuario aparecen como emoji en las repisas (foodEmoji de data/foods.ts +
                            mini-mapa de utensilios), con chip "+N" si hay más de los que caben. Ingredientes =
                            User.pantry clasificados fresco/seco por keywords (isFresh, cosmético); utensilios =
                            User.utensils. Solo anima transform/opacity/filter (nunca sobre contenido con blur);
                            prefers-reduced-motion apaga animaciones decorativas. Todos los planes.
    Waitlist.tsx          → 📋 waitlist de pre-lanzamiento (/waitlist, PÚBLICA sin auth): email →
                            posición + link de referido (?ref=), código propio en localStorage
                            ('savora.waitlist.code') para mostrar estado al volver. i18n waitlist.*
    Chat.tsx              → chat con el chef
    RecipesSaved.tsx      → recetas favoritas + carpetas
    SetupProfile.tsx      → onboarding de perfil (multi-step)
    Profile.tsx           → editar perfil
  components/
    ui/
      AnimatedBackground.tsx   → fondo animado con SVGs de cocina
      AvatarMenu.tsx           → menú dropdown con toggle idioma EN/ES
      Container.tsx            → wrapper con back button
    recipes/
      RecipeCard.tsx           → card completo de receta generada
      RecipeSearchBar.tsx      → barra de búsqueda con botón generar
    ProtectedRoute.tsx
  context/
    AuthContext.tsx
  services/
    api.ts                     → todas las llamadas al backend
  i18n/
    index.ts                   → config de react-i18next
    en.json                    → traducciones inglés
    es.json                    → traducciones español
  hooks/
    useTTS.ts                  → text-to-speech (pendiente)
  styles/
    index.css
  App.tsx                      → rutas
  main.tsx                     → entry point, importa i18n
```

## Flujo de navegación
```
/ → redirect según token
Login / Register
  ↓
SetupProfile (primera vez)
  ↓
Dashboard
  ├── → RecipeStart ("Help me decide") → TimeSelect → MealTypeSelect → PantryCheck (elegir:
  │        "Cook with what I have" [My Kitchen; vacío→/kitchen] o "Any recipe") → RecipeSuggestions
  │        (elegir sugerencia → si hay faltantes: sheet "add missing to market" (gratis, todos los
  │        planes) → Recipes auto-genera → cook mode)
  ├── → Market (/market, gratis, todos los planes — tarjeta cuadrada en el grid del Dashboard)
  │        (al "Clear purchased" ofrece pasar los comprados a My Kitchen)
  ├── → Kitchen (/kitchen, todos los planes — tarjeta en Dashboard)
  │        (chips con autosave + foto de nevera; "What can I cook?" → RecipeSuggestions con from:'kitchen')
  ├── → RecipesSaved
  └── AvatarMenu → Profile
                 → Logout

Recipes → RecipeCard → Chat (/chat/:conversationId)
```
(2026-07-12: RecipeMode y FridgeAnalyzer se ELIMINARON — PantryCheck absorbió foto+texto de nevera.)

## Branding Savora
- **Color principal:** `bg-orange-400` (#FB923C), hover: `bg-orange-500`
- **Fondo global:** `AnimatedBackground` con SVGs de cocina flotantes
- **Cards:** `bg-white/80 backdrop-blur-sm` sobre el fondo animado
- **Rounded:** `rounded-2xl` como estándar, `rounded-xl` para elementos pequeños
- **Sombras:** `shadow-md shadow-orange-200/60`
- **Login/Register:** card con `bg-white/80 backdrop-blur-sm rounded-3xl`

## api.ts — funciones disponibles
```typescript
loginUser(email, password)
getProfile()
updateProfile(data)
generateRecipe(message)           // incluye language automáticamente desde i18n
getDailyRecipe(mealTime)          // incluye language
getSuggestions(mealType)          // sugerencias con descripción, filtradas por historial
analyzeFridge(images[], mealTime, textIngredients?) // base64 images o texto → 6 sugerencias + detectados
getMarket() / addMarketItem(item) / updateMarketItem(id, patch) / deleteMarketItem(id)
clearCheckedMarket() / generateMarket(items) / estimateMarketPrices()  // PRO_ONLY(403) | DAILY_LIMIT_REACHED(429)
getUserRecipes()
getRecipeById(id)
toggleFavorite(id)
deleteRecipe(id)
moveRecipeToFolder(id, folderId)
getUserFolders()
createFolder(name)
renameFolder(id, name)
deleteFolder(id)
sendMessage(message, conversationId)
getConversationMessages(conversationId)
```

## i18n — ⚠️ APP DE UN SOLO IDIOMA: INGLÉS (2026-06-25)
- **Decisión de diseño + compatibilidad:** la app es **solo inglés**. `i18n/index.ts` fija
  `lng:'en'`, `supportedLngs:['en']`, **sin** `LanguageDetector`, y solo carga `en.json`.
- Todos los strings visibles siguen en `t('clave')` (NO se hardcodean) → todo resuelve a inglés.
- **La IA sale en inglés sola:** los call sites hacen `i18n.language?.startsWith('es') ? 'es' : 'en'`;
  como `i18n.language` siempre es `'en'`, mandan `language='en'` al backend sin tocar nada.
- Ya **no hay toggle de idioma** en `AvatarMenu` (se quitó).
- `src/i18n/es.json` queda en disco pero **NO se importa** (dormido) → revertir a bilingüe = volver a
  añadir `LanguageDetector` + el recurso `es` en `index.ts` y el toggle en `AvatarMenu`.
- **Toda clave usada en código DEBE existir en `en.json`** (si falta, sale cruda como `algo.algo`;
  los `defaultValue` viejos suelen estar en español). Auditado 2026-06-25: en.json cubre todas.

## Convenciones de código
- Componentes en PascalCase
- Funciones y variables en camelCase
- Clases Tailwind directo en JSX — sin CSS modules
- `useTranslation()` en TODOS los componentes con texto visible
- `useNavigate` para navegación, pasar contexto via `location.state`
- Estado del flujo (timeAvailable, mealType, fridgeContext) viaja por `state` entre páginas
- `api.ts` es la única capa de comunicación con el backend — no usar `fetch` directo

## ⚡ Rendimiento (2026-06-29) — CONVENCIONES, seguir al añadir features
- **Code-splitting (App.tsx):** todas las rutas son `React.lazy()` + un `<Suspense>` global. **Eager
  solo** Login + Dashboard + wrappers (AuthProvider/ProtectedRoute/PlanGate/BottomTabBar/ScrollFade/
  ScrollToTop/AnimatedBackground/SplashScreen). **Al añadir una página nueva → impórtala con `lazy()`,
  NO con `import` estático** (un import estático la mete en el chunk principal y vuelve a inflar el
  bundle). Resultado actual: 1 bundle ~720kB → inicial ~332kB + 40+ chunks bajo demanda.
- **Glass en listas → usar `.sv-glass-solid` (NO `.sv-glass`):** `.sv-glass` lleva `backdrop-filter:
  blur(24px)`, que al scrollear re-difumina el fondo de CADA card en cada frame → jank en móvil.
  `.sv-glass-solid` (en savora-ui.css) es idéntica (borde/sombra/radio) pero con fondo casi opaco y
  SIN blur. **Toda tarjeta que se repita dentro de una lista/feed que scrollea debe usar
  `.sv-glass-solid`** (ya aplicado en PostCard, Achievements, RecipesSaved, CoursesCatalog,
  FriendsPanel). El `.sv-glass` real se reserva para cards únicas/estáticas (dashboard, login, modales,
  detalle) donde el vidrio se luce y no cuesta.
- **Animaciones:** NUNCA animar `scale` (ni `width/height`) sobre un elemento con `filter: blur()` →
  re-rasteriza el desenfoque cada frame. Animar solo `transform: translate` y/o `opacity` (componen una
  capa ya rasterizada). Las orbs (`svDrift`/`svPulseOrb`) ya son translate/opacity-only + `will-change`
  + respetan `prefers-reduced-motion`.

## Estado del contexto entre páginas (location.state)
```typescript
// TimeSelect → MealTypeSelect
{ timeAvailable: '30 minutes' | null }

// MealTypeSelect → PantryCheck
{ timeAvailable, mealType: 'breakfast'|'lunch'|'dinner'|'snack'|'dessert'|'drink'|'cocktail'|'surprise' }

// PantryCheck → RecipeSuggestions
// (prefetched = sugerencias que ya vinieron del análisis de foto, si los chips no se editaron)
{ timeAvailable, mealType, ingredients: string[], prefetched?: Suggestion[] }

// RecipeSuggestions → Recipes (auto-genera con prefillQuery → cook mode)
{ timeAvailable, mealType, prefillQuery: string, fridgeContext?: { title, ingredients[] } }
```

## Estado actual (fase 2 — casi completa)
### ✅ Implementado
- Auth (login, register, verify email)
- Dashboard con receta del día inteligente (según hora del dispositivo)
- Flujo: TimeSelect → MealTypeSelect → PantryCheck (despensa persistente, foto/texto) → RecipeSuggestions
- 🛒 Market (/market, **gratis, todos los planes**): lista de compras de comida GENÉRICA (sin
  marcas). Buscador estático client-side (`src/data/foods.ts`, ~350 comidas con emoji, instantáneo,
  sin API) → tocar para añadir (o escribir la propia); nota opcional de marca por ítem; precio
  estimado por IA + total. (2026-07-13 se ELIMINÓ el buscador de productos reales Kroger/Open Food
  Facts: fotos lentas + productos raros. Ya no hay fotos: emoji por `foodEmoji(name)`. Mismo día:
  se quitó el gate PRO/CHEF — sin `PlanGate` en la ruta, sin candado en el Dashboard — para
  soportar el flujo "cualquier receta, compro lo que falte" desde `RecipeSuggestions` sin muro de
  plan.)
- 🥘 My Kitchen (/kitchen, todos): despensa visible/editable fuera del flujo + comprado→cocina desde Market
- Generador de recetas con sugerencias rápidas por mealType
- Chat con el chef
- RecipesSaved con carpetas y favoritos
- SetupProfile multi-step
- Profile editable con opciones visuales
- i18n bilingüe EN/ES completo
- AvatarMenu con toggle de idioma
- AnimatedBackground global
- Plan FREE indicator en Dashboard (3 recetas, barra de progreso)
- Skeleton loading en Recipes
- Validación de input (mínimo 3 chars, clasificador de intención)

### ⏳ Pendiente
- Dark mode (auto sistema + toggle manual) — diseñado, pendiente implementar
- TTS en RecipeCard
- Pantalla de Upgrade / Stripe
- Notificaciones push
- Streak de cocina en Dashboard
- Stats personales en Dashboard
- Feed social (fase 3)
- Reto semanal (fase 3)

## Variables de entorno
```
VITE_API_URL=http://localhost:3000/api
```

## Comandos
```bash
npm run dev      # desarrollo (puerto 5173)
npm run build    # build producción
```

## Notas
- Tailwind: solo clases pre-definidas del stylesheet base (no JIT custom)
- `import.meta.env` con cast `(import.meta as any).env` para evitar errores TS
- El `main.tsx` importa `'../i18n'` ANTES que App para que las traducciones estén listas
- `location.state` puede ser null si el usuario navega directo a la URL — siempre usar `?? null`
- RecipeCard tiene textos hardcodeados en español (Ingredientes, Utensilios, etc.) — pendiente i18n

@.claude/frontend-skill.md