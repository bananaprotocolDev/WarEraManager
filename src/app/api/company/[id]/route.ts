import { WareraClient } from "@/lib/warera/client";
import { buildCompanyDetail } from "@/server/company-detail";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const client = new WareraClient({ apiKey });
  try {
    const detail = await buildCompanyDetail(client, {
      companyId: id,
      userId,
      authenticated: Boolean(apiKey),
    });
    return Response.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
