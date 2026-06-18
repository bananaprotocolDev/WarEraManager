# WarEra Company Manager

Herramienta para optimizar la economía de tus empresas en WarEra.io: beneficio/día por empresa,
recomendador de contratación, optimizador de producción, precios y tendencias.

## Correr en local

1. Copiá `.env.example` a `.env.local` y completá `DATABASE_URL` (Neon o Postgres local) y `CRON_SECRET`.
2. `npm install`
3. `npm run dev` → http://localhost:3000
4. (Opcional) `npm run collect` toma un snapshot de precios al histórico.

## Tests

`npm test` · type-check `npx tsc --noEmit` · build `npm run build`

## Despliegue (Vercel + GitHub Actions)

1. Creá una base en [Neon](https://neon.tech) y copiá el `DATABASE_URL`.
2. Subí el repo a GitHub.
3. En Vercel: New Project → importá el repo → env vars `DATABASE_URL` y `CRON_SECRET` → Deploy.
   Las tablas de Postgres se crean solas en el primer uso.
4. **Snapshots de precios (cron):** el cron de Vercel free es 1 vez/día, así que la recolección la
   dispara un workflow de GitHub Actions (`.github/workflows/collect-prices.yml`) cada 30 min.
   En el repo de GitHub → Settings → Secrets and variables → Actions, agregá:
   - `APP_URL` → la URL pública de Vercel (ej. `https://tu-app.vercel.app`)
   - `CRON_SECRET` → el mismo valor que en Vercel
   (Podés correrlo a mano desde la pestaña Actions con "Run workflow".)

## Seguridad

Tu API token de WarEra (opcional, para salarios/calibración) se guarda solo en tu navegador
(`sessionStorage`) y se envía por-petición; nunca se persiste en el servidor.
