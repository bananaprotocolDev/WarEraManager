import { getPriceStore } from "@/lib/db/get-price-store";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const item = url.searchParams.get("item");
  if (!item) {
    return Response.json({ error: "item is required" }, { status: 400 });
  }
  // 7 días por defecto; ignora valores inválidos (NaN, <=0).
  const hoursRaw = Number(url.searchParams.get("hours"));
  const hours = hoursRaw > 0 ? hoursRaw : 168;
  const since = Date.now() - hours * 60 * 60 * 1000;
  const points = await getPriceStore().getHistory(item, since);
  return Response.json({ item, points });
}
