# Savora

App de generación de recetas con IA para Gen Z: genera recetas personalizadas, modo cocina
paso a paso, cursos gamificados, planificador semanal, lista de mercado, red social y clanes.

## Estructura

```
Savora/
  Backend/ai-backend/   → NestJS + Prisma + Supabase (PostgreSQL) + OpenAI
  Frontend/             → React 18 + Vite + TypeScript + Tailwind CSS
```

Cada carpeta tiene su propio `CLAUDE.md` con la documentación detallada del módulo.

## Stack

| Capa | Tecnologías |
|------|-------------|
| Backend | NestJS, Prisma, PostgreSQL (Supabase), JWT, Socket.IO |
| IA | OpenAI `gpt-4.1-mini` (recetas, chat), `gpt-4o` (visión, moderación) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, react-i18next |
| Infra | Supabase (DB + Storage), Resend (email), RevenueCat (IAP) |

## Puesta en marcha

Requisitos: Node.js 18+ y una base de datos PostgreSQL (Supabase).

### 1. Backend

```bash
cd Backend/ai-backend
npm install
cp .env.example .env        # completa las variables (ver abajo)
npx prisma generate
npm run start:dev           # http://localhost:3000 (prefijo /api)
```

### 2. Frontend

```bash
cd Frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:3000/api
npm run dev                 # http://localhost:5173
```

## Variables de entorno

Los valores reales **nunca** se versionan. Usa las plantillas:

- `Backend/ai-backend/.env.example` — DB, JWT, OpenAI, Resend, Supabase Storage, RevenueCat
- `Frontend/.env.example` — `VITE_API_URL`

Las imprescindibles para arrancar en local: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`
y `CORS_ORIGIN=http://localhost:5173`.

## Comandos útiles

```bash
# Backend
npm run start:dev      # desarrollo con hot reload
npm test               # unit tests (jest)
npx prisma studio      # UI para inspeccionar la DB

# Frontend
npm run dev            # desarrollo (puerto 5173)
npm run build          # build de producción
```

## Notas

- **Migraciones de DB:** los cambios de esquema se aplican con SQL dirigido desde
  `Backend/ai-backend/prisma/manual/`. No usar `prisma db push --accept-data-loss`.
- **Idioma:** la app es solo inglés en la UI; los prompts a OpenAI van en inglés.
- **Comentarios y mensajes de error** del backend están en español por convención del proyecto.
