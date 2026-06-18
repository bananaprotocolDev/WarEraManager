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

## Despliegue (Vercel)

1. Creá una base en [Neon](https://neon.tech) y copiá el `DATABASE_URL`.
2. Subí el repo a GitHub.
3. En Vercel: New Project → importá el repo → env vars `DATABASE_URL` y `CRON_SECRET` → Deploy.
4. El cron (`vercel.json`) toma snapshots de precios cada 30 min; las tablas se crean solas.

## Seguridad

Tu API token de WarEra (opcional, para salarios/calibración) se guarda solo en tu navegador
(`sessionStorage`) y se envía por-petición; nunca se persiste en el servidor.
