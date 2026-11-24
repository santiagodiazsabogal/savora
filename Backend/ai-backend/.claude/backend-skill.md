# Savora Backend — Skill para Claude Code

## Contexto del proyecto
Backend de **Savora**, app de recetas con IA para Gen Z.
- **Stack:** NestJS + Prisma + Supabase (PostgreSQL) + OpenAI + JWT
- **Entorno:** Windows / PowerShell
- **DB:** Supabase proyecto `fymtrdarxyghmivxsgim` (us-west-2)

---

## Arquitectura y estructura

```
src/
  ai/           → openai.service.ts (toda la lógica de IA)
  auth/         → registro, login, JWT strategy, guards
  chat/         → mensajes con el chef, detección de intents
  prisma/       → PrismaService (singleton)
  recipes/      → generación, favoritos, carpetas, daily, fridge, suggestions
  tts/          → text-to-speech (pendiente créditos xAI)
  users/        → perfil, update, DTOs
prisma/
  schema.prisma → modelos principales
```

---

## Convenciones de código NestJS

### Estructura de módulos
- Cada feature tiene su propio módulo: `feature.module.ts`, `feature.controller.ts`, `feature.service.ts`
- Los servicios se inyectan via constructor con `private readonly`
- Usar `@Injectable()`, `@Controller()`, `@UseGuards(JwtAuthGuard)` siempre
- Guards van en el controller, no en el módulo

### Controllers
```typescript
// Siempre validar req.user?.id antes de operar
if (!req.user?.id) throw new UnauthorizedException('Not authenticated');

// Tipar el Request correctamente
@Req() req: Request & { user?: any }

// Validar inputs básicos en el controller
if (!message?.trim()) throw new BadRequestException('Message is required');
```

### Services
```typescript
// Siempre verificar que el recurso pertenece al usuario
const recipe = await this.prisma.recipe.findFirst({ where: { id, userId } });
if (!recipe) throw new NotFoundException('Recipe not found');

// Nunca hacer update sin verificar ownership primero
```

### DTOs y validación
- Usar class-validator para DTOs de entrada
- Sanitizar inputs del usuario antes de pasarlos a la IA
- Máximo 500 chars para inputs de texto libre

---

## Prisma — Patrones correctos

```typescript
// ✅ Correcto — findFirst para verificar ownership
const item = await this.prisma.model.findFirst({ where: { id, userId } });

// ✅ Seleccionar solo campos necesarios
const recipes = await this.prisma.recipe.findMany({
  select: { id: true, title: true, cookTime: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// ✅ Transacciones para operaciones relacionadas
await this.prisma.$transaction([
  this.prisma.message.deleteMany({ where: { conversationId } }),
  this.prisma.conversation.delete({ where: { id: conversationId } }),
]);

// ❌ Nunca hacer update sin verificar ownership
await this.prisma.recipe.update({ where: { id } }); // MALO

// ✅ Siempre verificar antes
const recipe = await this.prisma.recipe.findFirst({ where: { id, userId } });
if (!recipe) throw new NotFoundException();
await this.prisma.recipe.update({ where: { id } }); // BIEN
```

### Relaciones importantes
- `Recipe` → `Conversation` (1:1, cascade delete)
- `Recipe` → `RecipeFolder` (many:1, optional)
- `User` → `Recipe` (1:many, cascade delete)
- Al eliminar Recipe → eliminar Messages → eliminar Conversation → eliminar Recipe

---

## Seguridad y ciberseguridad

### Autenticación JWT
- Tokens expiran en **30 días** (configurado)
- Guard `JwtAuthGuard` en TODOS los endpoints que requieren auth
- Nunca exponer el JWT secret ni loggear payloads completos
- Validar `req.user?.id` en cada endpoint protegido

### Sanitización de inputs
```typescript
// Siempre sanitizar antes de pasar a la IA
private sanitizeInput(input: string): string {
  return input.trim().slice(0, 500)
    .replace(/<[^>]*>/g, '')           // strip HTML
    .replace(/[{}[\]]/g, '')           // strip template chars
    .replace(/ignore previous|forget|system prompt|jailbreak/gi, '') // anti-injection
}
```

### Prompt injection
- Validar intención culinaria antes de llamar a OpenAI (`isCookingRelated()`)
- Nunca ejecutar texto del usuario directamente en prompts sin sanitizar
- Limitar longitud de inputs (máx 500 chars para queries de usuario)

### Rate limiting y límites de negocio
- Plan FREE = **3 recetas** (requestsUsed en User)
- Verificar límite ANTES de llamar a OpenAI (no después)
- El chat NO consume el límite — solo generate, daily y analyze-fridge
- Incrementar requestsUsed solo en éxito, nunca en error

### CORS
- Configurado via variable de entorno `CORS_ORIGIN`
- Nunca hardcodear origins

### Variables de entorno requeridas
```
DATABASE_URL     → Supabase connection string
JWT_SECRET       → Secret para firmar tokens
OPENAI_API_KEY   → API key de OpenAI
RESEND_API_KEY   → API key para emails
CORS_ORIGIN      → Origins permitidos (ej: http://localhost:5173)
PORT             → Puerto del servidor (default: 3000)
```

---

## OpenAI — Patrones y costos

### Modelos usados
- `gpt-4.1-mini` → generación de recetas, chat, sugerencias (barato)
- `gpt-4o` → análisis de imágenes de fridge (más caro, solo si hay fotos)
- Si el usuario manda texto en vez de fotos → usar `gpt-4.1-mini` siempre

### Prompts
- Sistema en inglés, respuesta en idioma del usuario (`language` param)
- Siempre usar `response_format: { type: 'json_object' }` para structured output
- Temperatura 0.8-0.9 para variedad, 0 para clasificadores
- Pasar `recentTitles` para evitar repetición de recetas
- Pasar perfil del usuario (cookingLevel, dietType, allergies, goal) en cada llamada

### Estructura de prompts seguros
```typescript
// ✅ Instrucciones del sistema separadas del input del usuario
messages: [
  { role: 'system', content: systemPrompt },    // instrucciones fijas
  { role: 'system', content: profileContext },   // contexto del usuario
  { role: 'user', content: safeMessage },        // input sanitizado
]
```

---

## Reglas de negocio críticas

| Regla | Detalle |
|-------|---------|
| Límite FREE | 3 recetas totales (generate + daily + fridge con fotos) |
| Chat sin límite | El chat nunca consume requestsUsed |
| Daily recipe caché | Una por userId+mealTime+fecha. Si existe, no gasta tokens |
| Diversidad | Pasar últimos 10 títulos al prompt para evitar repetición |
| Streak | Se actualiza al generar receta. Hoy=no cambia, ayer=+1, más días=reset a 1 |
| Valores DB | cookingLevel, dietType, goal siempre en inglés en la DB |
| Fridge texto | Usar gpt-4.1-mini. Fridge foto → gpt-4o |

---

## Manejo de errores

```typescript
// Errores HTTP correctos
throw new NotFoundException('Recipe not found');      // 404
throw new UnauthorizedException('Not authenticated'); // 401
throw new ForbiddenException('LIMIT_REACHED');        // 403
throw new BadRequestException('Message is required'); // 400

// El frontend detecta estos mensajes específicos:
// 'LIMIT_REACHED' → muestra pantalla de upgrade
// 'NOT_FOOD_RELATED' → muestra mensaje específico
```

---

## Comandos útiles

```bash
npm run start:dev          # desarrollo con hot reload
npx prisma generate        # regenerar cliente después de cambiar schema
npx prisma db push         # sincronizar schema con DB (NO en producción)
npx prisma studio          # UI para inspeccionar la DB
```

## Notas Windows/PowerShell
- No usar backslashes en comandos multi-línea
- Los comandos curl deben ir en una sola línea
- La DB de Supabase puede pausarse — restaurar desde el dashboard si da P1001
