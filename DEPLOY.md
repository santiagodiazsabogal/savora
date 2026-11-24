# Despliegue de Savora

Estado actual:

| Pieza | Estado | URL |
|-------|--------|-----|
| Frontend | ✅ **en línea** | https://santiagodiazsabogal.github.io/savora/ |
| Backend | ⏳ pendiente de crear el servicio | — |

El frontend se redespliega solo en cada push a `main` que toque `Frontend/`
(workflow `.github/workflows/deploy-frontend.yml`).

---

## Backend — 5 minutos en Render

Requiere crear la cuenta a mano (no se puede automatizar: pide email, contraseña
y aceptar términos). El blueprint `render.yaml` ya está en el repo, así que Render
configura el servicio solo.

1. Entra a <https://dashboard.render.com/blueprints> y regístrate (puedes usar
   "Sign in with GitHub"; el plan gratuito basta).
2. **New Blueprint Instance** → elige el repo `santiagodiazsabogal/savora`.
   Render detecta `render.yaml` y propone el servicio `savora-backend`.
3. Rellena las variables que pide en pantalla (las marcadas `sync:false`).
   Cópialas de tu `.env` local:

   | Variable | De dónde sale |
   |----------|---------------|
   | `DATABASE_URL` | Supabase → Session pooler, puerto **5432**, con `?connection_limit=5` |
   | `JWT_SECRET` | cadena larga y aleatoria (en producción, **distinta** de la de dev) |
   | `OPENAI_API_KEY`, `RESEND_API_KEY` | tu `.env` |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
   | `CORS_ORIGIN` | `https://santiagodiazsabogal.github.io` |
   | `FRONTEND_URL` | `https://santiagodiazsabogal.github.io/savora` |
   | `APP_URL` | la URL que Render asigne (ej. `https://savora-backend.onrender.com`) |

4. **Create**. El primer build tarda ~3-5 min (`npm ci && prisma generate && nest build`).
5. Comprueba que responde: `https://<tu-servicio>.onrender.com/api` → `{"success":true}`.

### Conectar el frontend al backend

Último paso, y la app queda funcionando de punta a punta:

```bash
gh variable set VITE_API_URL --body "https://<tu-servicio>.onrender.com/api" --repo santiagodiazsabogal/savora
gh workflow run deploy-frontend.yml --repo santiagodiazsabogal/savora
```

La URL de la API se incrusta en tiempo de build, así que **hay que redesplegar**
el frontend después de definir la variable. Sin ella, la app carga pero el login
y la generación de recetas fallan.

---

## Notas

- **Región Oregon (us-west-2)** en `render.yaml`: es deliberado. Co-ubicar el
  backend con la DB de Supabase baja el round-trip de ~155 ms a ~2-5 ms. Es la
  palanca de rendimiento más grande del proyecto; no cambiar de región.
- **Plan free de Render:** el servicio se duerme tras ~15 min sin tráfico y la
  primera petición después tarda ~30 s en despertar. Para producción real, el
  plan Starter lo evita.
- **Tras desplegar, re-correr el load test desde la región** para medir el techo
  real y afinar `connection_limit` (pendiente #7 del CLAUDE.md raíz).
- **El dominio savoracook.com** se puede apuntar a Pages (Settings → Pages →
  Custom domain) cuando quieras; habrá que actualizar `CORS_ORIGIN` y
  `FRONTEND_URL` en Render.
