/**
 * Verificación end-to-end: calcula el beneficio/día de las empresas de un usuario.
 * Uso: npm run profit -- <userId> <countryId>
 *
 * NOTA: las cifras son ESTIMADAS hasta calibrar game-constants (ver spec §4).
 * gameConfig.getGameConfig se consulta crudo acá; su parseo tipado llega en el Plan 2.
 */
import { WareraClient } from "../src/lib/warera/client";
import { companyProfit } from "../src/lib/economy";
import type { ItemDef } from "../src/lib/economy";

async function main() {
  const [userId, countryId] = process.argv.slice(2);
  if (!userId) {
    console.error("Uso: npm run profit -- <userId> [countryId]");
    process.exit(1);
  }

  const client = new WareraClient();
  const prices = await client.getPrices();

  // gameConfig crudo: extraemos el mapa de items -> { productionPoints, productionNeeds, type }
  const gcRes = await fetch("https://api2.warera.io/trpc/gameConfig.getGameConfig", {
    headers: { Origin: "https://app.warera.io", "User-Agent": "Mozilla/5.0" },
  });
  const gc = (await gcRes.json())?.result?.data ?? {};
  const itemsRaw: Record<string, any> = gc.items ?? {};
  const itemDef = (code: string): ItemDef => {
    const r = itemsRaw[code] ?? {};
    return {
      code,
      type: r.type ?? "product",
      productionPoints: r.productionPoints ?? 1,
      productionNeeds: r.productionNeeds ?? {},
    };
  };

  const taxes = countryId
    ? (await client.getCountryById(countryId)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  const list = await client.getUserCompanies(userId);
  console.log(`\nEmpresas de ${userId}: ${list.items.length}\n`);

  let total = 0;
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    const workers = await client.getWorkers(companyId);
    const item = itemDef(c.itemCode);
    const p = companyProfit({
      company: {
        id: c._id,
        itemCode: c.itemCode,
        production: c.production,
        workerCount: c.workerCount,
        upgrades: c.activeUpgradeLevels,
      },
      item,
      workers,
      prices,
      taxes,
    });
    total += p.netProfit;
    console.log(
      `${c.itemCode.padEnd(12)} neto/día=${p.netProfit.toFixed(2)}  ` +
        `(ingresos=${p.revenue.toFixed(2)} inputs=${p.inputCost.toFixed(2)} ` +
        `salarios=${p.wageCost.toFixed(2)} imp=${p.tax.toFixed(2)})`,
    );
  }
  console.log(`\nTOTAL neto/día estimado: ${total.toFixed(2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
