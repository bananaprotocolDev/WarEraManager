import { isAllowedProc, isCacheableProc } from "@/lib/warera/allowlist";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { RateLimiter } from "@/lib/server/rate-limit";

const UPSTREAM = "https://api2.warera.io/trpc";
const ORIGIN = "https://app.warera.io";

// Singletons por instancia (warm) de la función serverless.
const globalCache = new TtlCache(5 * 60 * 1000); // 5 min para datos globales
const limiter = new RateLimiter(120, 60 * 1000); // 120 req/min por IP

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ proc: string[] }> },
): Promise<Response> {
  const { proc: procParts } = await ctx.params;
  const proc = (procParts ?? []).join("/");

  if (!isAllowedProc(proc)) {
    return Response.json({ error: "Procedure not allowed" }, { status: 403 });
  }

  if (!limiter.allow(clientIp(req))) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const input = new URL(req.url).searchParams.get("input");
  let upstreamUrl = `${UPSTREAM}/${proc}`;
  if (input !== null) upstreamUrl += `?input=${encodeURIComponent(input)}`;

  const apiKey = req.headers.get("x-api-key") ?? undefined;

  const fetchUpstream = async (): Promise<{ status: number; body: string }> => {
    const headers: Record<string, string> = { Origin: ORIGIN, "User-Agent": "Mozilla/5.0" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const r = await fetch(upstreamUrl, { headers });
    return { status: r.status, body: await r.text() };
  };

  // Solo cacheamos datos globales y SOLO peticiones sin token (nunca cacheamos auth).
  let result: { status: number; body: string };
  if (isCacheableProc(proc) && !apiKey) {
    result = await globalCache.getOrLoad(upstreamUrl, fetchUpstream);
  } else {
    result = await fetchUpstream();
  }

  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
}
