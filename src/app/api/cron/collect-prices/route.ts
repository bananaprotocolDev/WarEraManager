import { timingSafeEqual } from "node:crypto";
import { WareraClient } from "@/lib/warera/client";
import { collectPrices } from "@/server/collect-prices";
import { getPriceStore } from "@/lib/db/get-price-store";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: sin secret configurado (o vacío), se permite
  // Comparación timing-safe del header Authorization.
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const collected = await collectPrices(new WareraClient(), getPriceStore());
    return Response.json({ ok: true, collected });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
