# Datos reales de empresa + look — Diseño (Plan A)

- **Fecha:** 2026-06-19
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (desplegado en Vercel)

## 1. Resumen

Enriquecer la app con datos reales del juego que hoy no mostramos —**nombre de empresa**, **imagen
del producto**, **rareza**, **almacén lleno** y **valor estimado**— y rediseñar las tarjetas y el
detalle para que se vea como una herramienta de verdad. (La precisión de los márgenes —bonus de
producción— es el Plan B, separado.)

## 2. Hallazgos de la API (verificados 2026-06-19)

- `company.getById` incluye: `name` (ej. "METALES PESADOS CORP"), `isFull` (almacén lleno),
  `estimatedValue`, `region`, además de lo que ya usamos (`itemCode`, `production`=stock,
  `workerCount`, `activeUpgradeLevels`).
- `gameConfig.items[code]` incluye `rarity` (`common|uncommon|rare|...`), `type`, `productionPoints`,
  `productionNeeds`, `isTradable`, `isDeposit`.
- **Imágenes de producto:** `https://app.warera.io/images/items/{itemCode}.png` (público). 29/59 items
  tienen imagen — todos los **raw/product** (output de empresas) la tienen; faltan solo piezas de
  equipamiento (no son output de empresas). Se usa un **fallback** cuando no hay imagen.

## 3. Datos a exponer

- **Nombre de empresa** (`company.name`) → título de la tarjeta/detalle; el `itemCode` pasa a subtítulo.
- **Imagen del producto** (URL de arriba, con fallback).
- **Rareza** del item (badge de color).
- **Almacén lleno** (`isFull`) → aviso visual junto al stock.
- **Valor estimado** (`estimatedValue`) → en el detalle.

## 4. Cambios técnicos

### 4.1 Schemas
- `companySchema`: añadir `name` (string, default ""), `isFull` (boolean, default false),
  `estimatedValue` (number, default 0). (`region` opcional; no se usa en Plan A.)
- `gameItemSchema` / `ItemDef`: añadir `rarity` (string, default "common"); `toItemDef` lo propaga.

### 4.2 Reportes
- `assembleCompanyReport` expone en `CompanyReport`: `name`, `rarity`, `isFull`, `estimatedValue`
  (además de lo actual). Se leen de `company`/`item`. Sin lógica nueva de cálculo.
- `CompanyDetail` ya incluye `report`; hereda los campos nuevos.

### 4.3 Componentes UI nuevos (reutilizables)
- `ItemImage` (`src/components/item-image.tsx`): `<img>` a `https://app.warera.io/images/items/{code}.png`
  con `onError` → fallback (ícono genérico lucide `Package` en un cuadro). `loading="lazy"`,
  `width/height` fijos para evitar layout shift, `alt` con el itemCode. Helper `itemImageUrl(code)`.
- `RarityBadge` (`src/components/rarity-badge.tsx`): badge con color por rareza. Mapeo a tokens
  existentes: `common`→muted, `uncommon`→success, `rare`→primary, `epic`/`legendary`→accent
  (cualquier rareza desconocida → muted). Texto siempre visible (no solo color).

### 4.4 UI
- **Tarjeta de empresa (dashboard):** imagen del producto (chica) + **nombre de empresa** (título)
  + `itemCode` (mono, subtítulo) + `RarityBadge`; debajo el beneficio/día, estado, producción/día,
  stock vs almacén (con aviso si `isFull`), tendencia de precio, y el hint de contratar (sin cambios).
- **Detalle:** header con imagen más grande + nombre + itemCode + rareza + `estimatedValue`; aviso de
  almacén lleno junto a la barra de almacén. El resto (desglose, trabajadores, contratación, receta,
  tendencia) queda igual.

### 4.5 Next.js / imágenes
- Usar `<img>` plano (no `next/image`) para evitar config de `remotePatterns` y costo de optimización
  en Vercel free. Lazy load + dimensiones fijas.

## 5. Criterios de éxito

- Tarjetas y detalle muestran **nombre de empresa**, **imagen real del producto** y **rareza**.
- `isFull` se ve cuando el almacén está lleno; `estimatedValue` aparece en el detalle.
- Imágenes faltantes degradan a un fallback prolijo (sin imágenes rotas).
- Schemas tolerantes (campos nuevos con default); tests de schemas, `ItemImage` (fallback),
  `RarityBadge`, y tarjeta/detalle actualizados. `npm test`/tsc/build verdes.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Item sin imagen (404) | `ItemImage` con `onError` → fallback lucide. |
| `name` ausente en empresas viejas | default "" → la UI cae al `itemCode` como título. |
| Layout shift al cargar imágenes | `width/height` fijos + `loading="lazy"`. |
| Rareza desconocida | mapeo default a "muted". |

## 7. Fuera de alcance (Plan B)

- Precisión de la tasa de producción / márgenes (bonus de país y depósito regional). Va en el Plan B.
- Nombre/área de la región (extra call) — opcional, se puede sumar luego.
