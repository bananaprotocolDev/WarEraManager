import { getPriceStore } from "@/lib/db/get-price-store";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const item = url.searchParams.get("item");
  if (!item) {
    return Response.json({ error: "item is required" }, { status: 400 });
  }
  const hours = Number(url.searchParams.get("hours") ?? "168"); // 7 días por defecto
  const since = Date.now() - hours * 60 * 60 * 1000;
  const points = getPriceStore().getHistory(item, since);
  return Response.json({ item, points });
}
