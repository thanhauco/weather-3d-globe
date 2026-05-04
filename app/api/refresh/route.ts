import { NextRequest, NextResponse } from "next/server";
import { refreshLatest } from "@/lib/refresh";

export const dynamic = "force-dynamic";
// Allow up to ~60s for the batched fetch + upsert on platforms that honor it.
export const maxDuration = 60;

// Optional shared secret. When CRON_SECRET is set, callers must provide it via
// the `Authorization: Bearer <secret>` header or `?secret=` query param. This
// protects the endpoint when it is exposed to a public cron.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // open in local/dev when unset
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forecastDays = Number(process.env.FORECAST_DAYS) || 3;
  try {
    const result = await refreshLatest(forecastDays);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

// POST is used by the in-app "Refresh data" button.
export async function POST(req: NextRequest) {
  return handle(req);
}

// GET is convenient for cron services (Vercel Cron, GitHub Actions, etc.).
export async function GET(req: NextRequest) {
  return handle(req);
}
