# Economía de contrataciones consciente de la cadena — Diseño

- **Fecha:** 2026-06-19
- **Estado:** Aprobado para planificación
- **Contexto:** WarEra Company Manager (desplegado; Plan B ya en prod)

## 1. Resumen

Hacer que la recomendación de contratación sea económicamente fiel considerando tres cosas que hoy
faltan:

1. **Mercado laboral real:** el veredicto compara, en `$/trabajador/día`, lo que **aporta** un
   trabajador vs lo que **cuesta** al salario que hoy pide el mercado (`wage/punto` mediano).
2. **Mejor destino del raw (mezcla vender/procesar):** cada ítem se valúa a su mejor destino
   `max(venderlo neto, procesarlo)`, así un raw como el petróleo deja de verse como pérdida falsa.
3. **Veredicto de cadena:** cuando el usuario es dueño de los dos extremos (iron→steel,
   petroleum→oil), un veredicto único de la cadena: ingreso del producto final − **todos** los
   sueldos de la cadena − insumos comprados afuera = `neto/día`.

Se entregan **ambas vistas**: veredicto por empresa (con valor real del ítem) **y** veredicto por
cadena.

## 2. Motivación (con datos reales, 2026-06-19)

Impuesto de mercado 1%. Salario mediano del mercado laboral = **0.13 / punto de producción**.

| Ítem | prodPoints | Valor neto/u (venta) | Insumo | Máx pagable/punto |
|---|---|---|---|---|
| petroleum | 1 | 0.0942 | — | 0.0942 |
| oil | 1 | 0.1757 | 1 petroleum | (depende del destino) |
| iron | 1 | 0.0797 | — | 0.0797 |
| steel | 10 | 1.573 | 10 iron (0.805) | 0.077 |

Hallazgos que el modelo debe exponer:

- **A 0.13/punto, contratar pierde en todas las empresas del usuario** → conviene automatización. La
  decisión efectivamente "depende del mercado laboral".
- **Procesar petróleo a oil hoy destruye valor:** vender petróleo rinde 0.0942/punto, hacer oil rinde
  0.0878/punto (0.1757 ÷ 2 puntos de trabajo). El mejor destino del petróleo **ahora** es venderlo.
- La cadena petroleum→oil **pierde** a salario de mercado (0.26 de mano de obra vs 0.1757 de ingreso).

El usuario hace **mezcla** (vende algunos raws y procesa otros) y quiere ver **ambos** veredictos.

## 3. Modelo de valor

### 3.1 Mapa de valor por ítem (mejor destino)

Para cada ítem `i`, el valor marginal real de producir una unidad más:

```
unitValue(i) = max(
  ventaNeta(i) = precio(i) × (1 − impMercado),
  procesar(i)  = (valor que aporta como insumo del producto del que SOS dueño) − labor de procesamiento
)
```

- `procesar(i)` solo aplica si existe una empresa **propia** que consume `i` como insumo. Se calcula
  por inducción hacia atrás desde el producto final (ver 3.3). Si el usuario no procesa `i`, o no es
  dueño del downstream, `procesar(i)` no aplica y `unitValue(i) = ventaNeta(i)`.
- El resultado expone también **qué destino ganó** (`"sell"` | `"process"`) para mostrarlo en UI.

### 3.2 Máximo pagable por punto (por empresa)

```
maxWagePerPoint(i) = (unitValue(i) − insumoCompradoPorUnidad(i)) ÷ prodPoints(i)
```

`insumoCompradoPorUnidad` = costo de los insumos que **no** te autoabastecés (los que comprás en el
mercado). Si te autoabastecés del insumo, su costo no entra aquí (entra como labor en su propio
eslabón vía el veredicto de cadena).

### 3.3 Valor de procesamiento (inducción hacia atrás, cadenas de 2 niveles)

Para un raw `r` consumido por un producto propio `q` (q necesita `n` unidades de `r` por unidad de q):

```
procesar(r) = [ ventaNeta(q) − insumosCompradosDe(q excepto r) − laborProcesamiento(q) ] ÷ n
laborProcesamiento(q) = wageMercado/punto × prodPoints(q)   // costo de mano de obra de procesar q al salario de mercado
```

`procesar(r)` es lo que vale una unidad de `r` cuando se transforma en `q`, neto de la mano de obra
que cuesta procesar `q`. Se compara con `ventaNeta(r)` en 3.1.

> Alcance: solo 2 niveles (raw→producto). 3+ niveles fuera de alcance (el usuario no los tiene).

## 4. Veredicto por empresa (en $/trabajador/día)

Reemplaza la salida técnica actual del `HiringPanel`:

```
unidadesPorDia = workerUnitsPerDay(perfil)                       // modelo laboral existente
aportaPorDia   = unidadesPorDia × (unitValue(i) − insumoCompradoPorUnidad(i))
costoPorDia    = wageMercado/punto × prodPoints(i) × unidadesPorDia
netoPorDia     = aportaPorDia − costoPorDia
```

- **Número principal:** `netoPorDia` ("este trabajador te dejaría +X/día" o "−X/día").
- **Detalle:** "el mercado pide ~`wage`/punto · podés pagar hasta ~`maxWagePerPoint`/punto".
- **Veredicto `viable`:** `netoPorDia > 0` **Y** hay cupo libre (breakRoom) **Y** hay demanda
  (headroom de venta si conocemos venta real; si no, se asume demanda).
- **Motivos (`reason`):** `ok` | `market_expensive` (nuevo: neto ≤ 0 por salario de mercado) |
  `no_slots` | `no_demand` | `item_unprofitable`.
- Perfil sugerido (minProduction/minEnergy/minLevel) derivado del mercado, como hoy.

## 5. Veredicto de cadena

`detectChains(companies, gameConfig)` arma cadenas donde el usuario es dueño de los dos extremos
(producto cuyo `productionNeeds` incluye un ítem que también produce en otra empresa propia). Por cada
cadena:

```
ingresoCadena/día = produccionFinalPorDia × ventaNeta(productoFinal)
costoCadena/día   = Σ sueldos reales de TODAS las empresas de la cadena
                    + insumos comprados afuera (los que no se autoabastecen)
netoCadena/día    = ingresoCadena − costoCadena
```

- `produccionFinalPorDia` usa la tasa **real medida** (Plan B) cuando hay token; si no, el modelo.
- Sueldos reales = Σ (wage de cada trabajador × prodPoints × su producción), de `worker.getWorkers`
  (auth-gated); sin token, se estima con el salario de mercado y los cupos ocupados.
- Salida: `{ chainId, steps: [raw, ..., final], netPerDay, bestRawDestination: "sell"|"process",
  measured: boolean }`.

## 6. Arquitectura / cambios técnicos

### 6.1 Lógica pura (`src/lib/economy/`)

- **`item-value.ts`** (nuevo): `bestDestinationValue({ item, prices, marketTax, ownedDownstream, ... })`
  → `{ unitValue, destination, sellNet, processValue }`. Puro.
- **`chain.ts`** (nuevo): `detectChains(companies, gameConfig)` → `Chain[]`; `chainNetPerDay(chain, …)`
  → `{ netPerDay, bestRawDestination, measured }`. Puro.
- **`hiring-recommender.ts`** (modificar): añadir `netPerWorkerPerDay`, `marketWagePerDay`,
  `addsPerDay`, y el motivo `market_expensive`. Mantener `viable`/`reason`/perfil.

### 6.2 Servicios (`src/server/`)

- **`company-report.ts`**: `assembleCompanyReport` recibe `unitValue`/`destination` (del mapa de
  valor) para que `marginPerUnit`/`maxWageToHire` reflejen el mejor destino. Servicios pasan el valor;
  el módulo sigue puro/testeable.
- **`company-detail.ts`**: calcular `bestDestinationValue` para el ítem (con downstream propio si
  existe), pasar al report y al `hiringRecommendation`; adjuntar el veredicto de cadena si la empresa
  pertenece a una.
- **`portfolio.ts`**: construir el mapa de empresas propias una vez, detectar cadenas, calcular
  `chainNetPerDay` por cadena (en paralelo con el resto), y exponer `chains: ChainReport[]` en el
  portfolio. Mantener el `Promise.all` y el orden actual.

### 6.3 UI

- **Dashboard** (`src/app/dashboard/page.tsx` + nuevo `src/components/dashboard/chains-card.tsx`):
  tarjeta "Cadenas" arriba de las empresas; una fila por cadena con `neto/día` (success/destructive,
  tabular) y "mejor destino del raw: vender / procesar". Si no hay cadenas, no se renderiza.
- **Detalle** (`src/components/detail/hiring-panel.tsx`): reescritura al formato `$/trabajador/día`
  (número principal neto, línea mercado-vs-máx, veredicto+motivo, perfil). Si la empresa pertenece a
  una cadena, línea "Parte de la cadena X→Y · neto cadena −Z/día · mejor destino: vender".
- Iconos lucide, colores semánticos, números `tabular`, sin emojis ni hex crudo.
- **Ya hecho** (fuera de este plan, commit aparte): la tarjeta "Mejoras" del detalle ahora muestra
  Motor automatizado / Almacenamiento / Cupos de trabajadores (antes faltaba Almacenamiento y decía
  "Sala de descanso").

## 7. Testing

TDD con Vitest. Lógica pura primero.

- `item-value.test.ts`: petróleo a precios actuales → destino `sell`; caso construido donde procesar
  gana → destino `process`; sin downstream propio → `unitValue = ventaNeta`.
- `chain.test.ts`: `detectChains` arma petroleum→oil e iron→steel y **no** arma cadenas sin ambos
  extremos; `chainNetPerDay` resta todos los sueldos + insumos comprados (caso pierde a 0.13/punto,
  caso gana a salario bajo).
- `hiring-recommender.test.ts`: wage 0.13 → `viable:false reason:market_expensive`; wage bajo →
  `viable:true` con `netPerWorkerPerDay > 0`.
- Servicios (`company-detail`, `portfolio`) con clientes fake (incluye cadena detectada y `chains` en
  el portfolio). UI: `HiringPanel` (formato $/día + motivo) y `chains-card` (filas, ocultación sin
  cadenas).
- `npm test` / `tsc` / `build` verdes.

## 8. Criterios de éxito

- El panel de contratación muestra `neto/trabajador/día` y el veredicto cambia con el salario de
  mercado (a 0.13/punto da "mercado caro / no conviene" en las empresas del usuario).
- Cada ítem se valúa a su mejor destino; el petróleo se reporta como "mejor destino: vender" a precios
  actuales.
- Existe un veredicto de cadena (petroleum→oil, iron→steel) con `neto/día` tras restar todos los
  sueldos + insumos comprados.
- Degrada con gracia: sin token → estimaciones de modelo/mercado; sin downstream propio → solo venta.
- Lógica pura testeada; servicios con fakes; UI con tests.

## 9. Fuera de alcance

- Cadenas de 3+ niveles y bonus de depósito regional (futuro).
- Optimización automática de cuánto vender vs procesar (solo informamos el mejor destino; no
  reasignamos producción por el usuario).
- Reescritura del modelo laboral (`workerUnitsPerDay`) — se reutiliza tal cual.
