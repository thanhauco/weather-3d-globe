import { NextRequest, NextResponse } from "next/server";
import { getActiveStorms } from "@/lib/storms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const atTime = req.nextUrl.searchParams.get("at") || new Date().toISOString();
  try {
    const storms = await getActiveStorms(atTime);
    return NextResponse.json({ storms });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
