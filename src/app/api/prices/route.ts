import { WareraClient } from "@/lib/warera/client";

export async function GET(): Promise<Response> {
  const client = new WareraClient();
  try {
    return Response.json(await client.getPrices());
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
