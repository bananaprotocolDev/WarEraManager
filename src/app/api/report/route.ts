import { WareraClient } from "@/lib/warera/client";
import { buildPortfolio } from "@/server/portfolio";
import { getRateFactor } from "@/server/calibration-factor";

export async function GET(req: Request): Promise<Response> {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const client = new WareraClient({ apiKey });

  try {
    const portfolio = await buildPortfolio(client, { userId, authenticated: Boolean(apiKey), rateFactor: getRateFactor() });
    return Response.json(portfolio);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
