# Savora Frontend — Skill para Claude Code

## Contexto del proyecto
Frontend de **Savora**, app de recetas con IA para Gen Z.
- **Stack:** React 18 + Vite + TypeScript + Tailwind CSS + react-i18next
- **Routing:** react-router-dom v6
- **Iconos:** lucide-react
- **Entorno:** Windows / PowerShell, mobile-first

---

## Estructura de carpetas

```
src/
  pages/              → Una página = un archivo
  components/
    ui/               → Componentes reutilizables (LoadingScreen, AvatarMenu, Container)
    recipes/          → RecipeCard, RecipeSearchBar
  services/
    api.ts            → ÚNICA capa de comunicación con el backend
  i18n/
    index.ts          → Config i18next
    en.json           → Traducciones inglés
    es.json           → Traducciones español
  context/
    AuthContext.tsx
  hooks/
  styles/
    index.css
  App.tsx             → Solo rutas, nada más
  main.tsx            → Entry point, importa i18n ANTES que App
```

---

## Flujo de navegación

```
/ → redirect según token
Login / Register → SetupProfile (primera vez) → Dashboard
Dashboard → TimeSelect → MealTypeSelect → RecipeMode → Recipes / FridgeAnalyzer
Recipes → RecipeCard → Chat (/chat/:conversationId)
Dashboard → RecipesSaved
AvatarMenu → Profile / toggle EN-ES / Logout
```

### Estado entre páginas (location.state)
```typescript
// El estado viaja via navigate('/ruta', { state: { ... } })
// SIEMPRE usar ?. y ?? null al leerlo — puede ser null si navegan directo
const timeAvailable: string | null = location.state?.timeAvailable ?? null
const mealType: string | null = location.state?.mealType ?? null
const fridgeContext: any = location.state?.fridgeContext ?? null
```

---

## Branding Savora

### Paleta de colores
```
Principal:    bg-orange-400 (#FB923C)  hover: bg-orange-500
Fondo:        bg-[#FFF8F3] (crema)
Cards:        bg-white/80 backdrop-blur-sm
Bordes:       border-orange-100 / border-orange-200
Sombras:      shadow-md shadow-orange-200/60
Error/fav:    text-red-400 / fill-red-400
Éxito:        bg-emerald-500
```

### Tipografía y espaciado
```
Títulos página:   text-3xl sm:text-4xl font-bold / font-black
Subtítulos:       text-xl font-bold
Cuerpo:           text-sm / text-base
Labels:           text-xs font-semibold uppercase tracking-wide text-gray-500
```

### Componentes estándar
```
Botón primario:   bg-orange-400 hover:bg-orange-500 rounded-2xl px-5 py-4 text-white font-bold active:scale-95
Botón secundario: bg-white border border-orange-100 hover:border-orange-300 rounded-2xl
Cards:            bg-white/80 backdrop-blur-sm border border-orange-100 rounded-2xl shadow-sm
Inputs:           border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-400
Badges/chips:     bg-orange-100 text-orange-600 text-xs font-semibold px-3 py-1 rounded-full
```

### Bordes redondeados
- `rounded-3xl` → modales, sheets grandes
- `rounded-2xl` → cards, botones principales, inputs
- `rounded-xl` → elementos secundarios, badges grandes
- `rounded-full` → badges, avatares, dots

---

## Convenciones de código React

### Componentes
```typescript
// ✅ Props tipadas siempre
interface Props {
  recipe: Recipe
  onSelect: (id: number) => void
  isLoading?: boolean
}

// ✅ Nombres en PascalCase, archivos igual
export default function RecipeCard({ recipe, onSelect }: Props) {}

// ✅ useTranslation en TODOS los componentes con texto visible
const { t, i18n } = useTranslation()
```

### Manejo de estado de carga
```typescript
// ✅ Patrón estándar: initialLoading bloquea toda la UI
const [initialLoading, setInitialLoading] = useState(true)

// Cargar todo en paralelo con Promise.all
const [dataA, dataB] = await Promise.all([fetchA(), fetchB()])

// Mostrar LoadingScreen hasta que todo esté listo
if (initialLoading) return <LoadingScreen />
```

### Comunicación con el backend
```typescript
// ✅ SIEMPRE usar api.ts — nunca fetch directo
import { generateRecipe, getUserRecipes } from '../services/api'

// ✅ Manejar errores específicos
try {
  const res = await generateRecipe(message)
} catch (err: any) {
  if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
  else if (err.message === 'LIMIT_REACHED') setError(t('recipes.limit_reached'))
  else if (err.message === 'NOT_FOOD_RELATED') setError(t('recipes.error_not_food'))
  else setError(t('recipes.error_generic'))
}
```

---

## i18n — Internacionalización

```typescript
// ✅ Nunca hardcodear texto visible
<p>{t('dashboard.generate_recipe')}</p>

// ✅ Con variables
t('dashboard.free_plan_remaining', { count: recipesLeft })

// ✅ Con arrays (para greetings random)
const pool: string[] = t('dashboard.greetings.morning', { returnObjects: true })

// ✅ Con fallback
t(`recipes.difficulty.${difficulty}`, { defaultValue: difficulty })

// Detectar idioma activo
const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
```

### Keys de i18n — estructura
```json
{
  "common": { "save", "cancel", "loading", "error_generic", "back", "logout" },
  "dashboard": { "generate_recipe", "saved_recipes", "daily_recipe", "greetings" },
  "recipes": { "title", "search_placeholder", "ingredients", "steps", "tip" },
  "meal_type": { "options": { "breakfast", "lunch", "dinner", "snack", "dessert", "drink", "cocktail", "surprise" } },
  "fridge": { "title", "take_photo", "analyzing", "detected_ingredients" },
  "chat": { "placeholder", "chef_label" },
  "profile": { "cooking_levels", "diet_types", "goals" }
}
```

---

## Patrones de diseño mobile-first

### Layout páginas con scroll
```typescript
// Páginas con input fijo abajo
<div className="flex flex-col h-screen overflow-hidden">
  <div className="flex-1 overflow-y-auto pb-28"> {/* content */} </div>
  <div className="fixed bottom-0 left-0 right-0"> {/* input bar */} </div>
</div>

// Páginas simples con Container
<Container backButton backTo="/dashboard">
  <div className="space-y-6 pb-10"> {/* content */ } </div>
</Container>
```

### Textarea auto-creciente
```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null)
useEffect(() => {
  const el = textareaRef.current
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}, [query])

// Enter envía, Shift+Enter nueva línea
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
}
```

### Skeleton loading
```typescript
// ✅ Skeleton mientras carga, NO spinner centrado
<div className="h-6 bg-gray-200 rounded-lg w-2/3 animate-pulse" />
<div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
```

### Bottom sheet / Drawer
```typescript
// Drawer desde la izquierda
<div className="fixed top-0 left-0 bottom-0 z-50 bg-white shadow-2xl"
  style={{ width: '80vw', maxWidth: '320px', animation: 'slideInLeft 0.25s ease-out' }}>

// Bottom sheet
<div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
  style={{ maxHeight: '60vh' }}>

// Siempre con overlay
<div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
```

---

## AnimatedBackground

El fondo animado (`AnimatedBackground`) se aplica globalmente en `App.tsx`. Todas las páginas son transparentes o usan `bg-white/80 backdrop-blur-sm` para ver el fondo.

```typescript
// ✅ Cards sobre el fondo animado
className="bg-white/80 backdrop-blur-sm border border-orange-100 rounded-2xl"

// ✅ Login/Register con transparencia
className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl"

// ❌ Nunca usar bg-white sólido en páginas principales
```

---

## LoadingScreen

Usar `<LoadingScreen />` en páginas que hacen fetch al cargar:

```typescript
const [initialLoading, setInitialLoading] = useState(true)
// ... fetch en useEffect ...
if (initialLoading) return <LoadingScreen />
```

Páginas que lo usan: Dashboard, Recipes, RecipesSaved, Profile
Páginas que NO lo necesitan: TimeSelect, MealTypeSelect, RecipeMode (sin fetch)

---

## Tailwind — Reglas importantes

- Solo clases **pre-definidas** del stylesheet base (sin JIT custom)
- No crear clases custom en `@layer`
- Para animaciones usar `style={{ animation: '...' }}` con `<style>` inline
- `import.meta.env` → usar cast `(import.meta as any).env` para evitar errores TS

---

## Errores comunes a evitar

```typescript
// ❌ fetch directo — siempre usar api.ts
const res = await fetch('/api/recipes')

// ❌ localStorage sin verificar
localStorage.getItem('token').split('.') // puede ser null

// ✅ Siempre verificar
const token = localStorage.getItem('token')
if (!token) { navigate('/login'); return }

// ❌ location.state sin nullcheck
const mealType = location.state.mealType // crashea si navegan directo

// ✅ Siempre con nullcheck
const mealType: string | null = location.state?.mealType ?? null

// ❌ Texto hardcodeado
<p>Generar receta</p>

// ✅ Siempre i18n
<p>{t('dashboard.generate_recipe')}</p>
```

---

## Variables de entorno

```
VITE_API_URL=http://localhost:3000/api
```

## Comandos

```bash
npm run dev      # desarrollo (puerto 5173)
npm run build    # build producción
```
