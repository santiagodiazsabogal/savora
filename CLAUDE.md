# Savora — Proyecto completo

App de generación de recetas con IA para Gen Z.

## Estructura
```
IA-Prototype/
  Backend/ai-backend/   → NestJS + Prisma + Supabase + OpenAI
  Frontend/             → React 18 + Vite + TypeScript + Tailwind
```

Cada carpeta tiene su propio CLAUDE.md con documentación detallada:
- @Backend/ai-backend/CLAUDE.md
- @Frontend/CLAUDE.md

**¿Nuevo en el proyecto?** Lee `Backend/ai-backend/HANDOFF.md`: setup paso a paso, reglas de oro
(DB compartida de producción, prisma, pool de conexiones) y cómo trabajar aquí con Claude Code.

## Cómo se conectan
- Backend corre en `http://localhost:3000` (prefijo `/api`)
- Frontend corre en `http://localhost:5173`
- CORS configurado via `CORS_ORIGIN=http://localhost:5173` en el `.env` del backend

## Variables de entorno compartidas (backend `.env`)
```
JWT_SECRET        → firma de tokens; el frontend solo guarda el token, no lo genera
CORS_ORIGIN       → origen permitido del frontend
OPENAI_API_KEY    → usado solo en el backend
DATABASE_URL      → Supabase Session pooler (puerto 5432)
```

## Convenciones cross-project
- TypeScript estricto en ambos lados, nunca `any` sin justificación
- camelCase para variables/funciones, PascalCase para clases y componentes
- Los prompts a OpenAI van en inglés; las respuestas en ES o EN según el param `language`
- El frontend pasa `Authorization: Bearer <token>` en cada request autenticado
- Errores HTTP: 401 sin token, 403 sin permisos, 429 límite FREE alcanzado

## 🚀 Pendientes para lanzar (actualizado 2026-07-10)
Lista consolidada de lo que FALTA. (Lo ya hecho: moderación/auth/borrar cuenta/admin, IAP backend,
robustez paso 3, escalabilidad+índices, tests unitarios críticos, optimizaciones de rendimiento
—code-splitting, N+1, animaciones, glass sólido—, hardening de concurrencia + datos efímeros,
y las features de julio: pantalla de inicio del generador, resumen completo en el Modo Cocina,
tarjeta social rediseñada + guardar recetas del feed, clanes como tab, y metas nutricionales con
calorías semanales + meta personalizada por fórmula TDEE. Ver los CLAUDE.md de cada repo.)

**🚫 Bloqueantes de App Store (para publicar):**
1. **iOS nativo:** envolver con **Capacitor** (la app es web pura) + **SDK RevenueCat** (paywall/UI de
   compra; el backend de IAP ya está) + permission strings cámara/fotos en `Info.plist` + cuenta demo
   CHEF en notas del revisor. **Requiere Mac.**
2. **Config RevenueCat (dashboard):** crear entitlements `pro`/`chef`, productos/suscripciones y apuntar
   el webhook a `https://<backend>/api/billing/webhook` con el `Authorization` = `REVENUECAT_WEBHOOK_SECRET`.
3. **Legal:** ajustar **jurisdicción/ley aplicable** y **edad mínima** (hoy 13) en `Terms.tsx`/`Privacy.tsx`
   (son plantillas). El resto del contenido legal ya está (inglés, contacto support@savoracook.com).

**🚀 Deploy / infra (para estar online y que escale — GRATIS, sin subir plan):**
4. **Desplegar backend co-ubicado en us-west-2** (Render/Fly/Railway/EC2 en Oregon) — **palanca #1 de
   velocidad**: cada query pasa de ~155ms a ~2-5ms. (Detalle: memoria `scalability-load-test`.)
5. **Desplegar frontend** (savoracook.com) — las páginas legales deben ser URLs públicas.
6. **Config de prod:** `CORS_ORIGIN` al dominio real, `JWT_SECRET` largo/aleatorio, env de RevenueCat/Sentry.
7. **Re-correr el load test DESDE la región** tras desplegar (medir el techo real, afinar `connection_limit`).

**🔧 Calidad / nice-to-have (no bloquean):**
8. **TTS** — esperar créditos de xAI (voz PRO cacheada; sin créditos no genera).
9. **Tests e2e reales** — necesitan DB de test separada (no la de prod). Los unit tests críticos ya están.
10. ✅ HECHO (2026-07-12): aceptación de términos **server-side** — `register` exige `acceptTerms=true`
    (400 `TERMS_NOT_ACCEPTED`) y estampa `User.termsAcceptedAt` (SQL `prisma/manual/add_terms_acceptance.sql`,
    ya aplicado). El frontend manda el checkbox en el body. Specs en `auth.service.spec.ts`.
11. `GlobalRecipe` cache más amplio (opcional); `backdrop-filter` en cards no-lista (decisión de diseño, se dejó).

**⏸️ Diferido a propósito (hasta tener ingresos):**
12. **Subir plan de Supabase** → sube el cap de 15 conexiones → habilita multi-instancia + `connection_limit`
    mayor. Hasta entonces, session pooler + `connection_limit=5` es lo óptimo (NO migrar al transaction pooler).
