/**
 * Verificación end-to-end: calcula el beneficio/día de las empresas de un usuario.
 * Uso: npm run profit -- <userId> <countryId>
 *
 * NOTA: las cifras son ESTIMADAS hasta calibrar game-constants (ver spec §4).
 */
import { WareraClient } from "../src/lib/warera/client";
import { companyProfit, toItemDef } from "../src/lib/economy";
import type { ItemDef } from "../src/lib/economy";

async function main() {
  const [userId, countryId] = process.argv.slice(2);
  if (!userId) {
    console.error("Uso: npm run profit -- <userId> [countryId]");
    process.exit(1);
  }

  const client = new WareraClient();
  const prices = await client.getPrices();

  const gameConfig = await client.getGameConfig();
  const itemDef = (code: string): ItemDef => {
    const raw = gameConfig.items[code] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
    return toItemDef(code, raw);
  };

  const taxes = countryId
    ? (await client.getCountryById(countryId)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  const list = await client.getUserCompanies(userId);
  console.log(`\nEmpresas de ${userId}: ${list.items.length}\n`);

  let total = 0;
  let workersUnavailable = false;
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    // worker.getWorkers está auth-gated: devuelve 401 para empresas de terceros.
    // Si falla, seguimos con salarios=0 y avisamos (ver hallazgo para Plan 2).
    let workers: Awaited<ReturnType<typeof client.getWorkers>> = [];
    try {
      workers = await client.getWorkers(companyId);
    } catch {
      workersUnavailable = true;
    }
    const item = itemDef(c.itemCode);
    const wageCostPerDay = workers.reduce((sum, w) => sum + w.wage, 0);
    const p = companyProfit({
      dailyProductionRate: 0, // placeholder — use buildPortfolio for real rate
      item,
      prices,
      taxes,
      wageCostPerDay,
    });
    total += p.netProfit;
    console.log(
      `${c.itemCode.padEnd(12)} neto/día=${p.netProfit.toFixed(2)}  ` +
        `(ingresos=${p.revenue.toFixed(2)} inputs=${p.inputCost.toFixed(2)} ` +
        `salarios=${p.wageCost.toFixed(2)} imp=${p.tax.toFixed(2)})`,
    );
  }
  console.log(`\nTOTAL neto/día estimado: ${total.toFixed(2)}\n`);
  if (workersUnavailable) {
    console.log(
      "AVISO: worker.getWorkers requiere autenticación (401). Los salarios se " +
        "contaron como 0, así que el beneficio está SOBREESTIMADO. Ver spec §6 / Plan 2.\n",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
