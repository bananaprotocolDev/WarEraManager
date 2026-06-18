import { WareraClient } from "@/lib/warera/client";
import { runCalibration } from "@/server/calibrate";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const apiKey = req.headers.get("x-api-key") ?? undefined;

  if (!apiKey) {
    return Response.json({ error: "API token required" }, { status: 401 });
  }
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const daysRaw = Number(url.searchParams.get("days"));
  const days = daysRaw > 0 ? daysRaw : 7;

  try {
    const result = await runCalibration(new WareraClient({ apiKey }), getCalibrationStore(), { userId, days });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
