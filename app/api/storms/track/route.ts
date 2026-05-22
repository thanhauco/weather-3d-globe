import { NextRequest, NextResponse } from "next/server";
import { getStormTrack } from "@/lib/storms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const eventId = Number(url.searchParams.get("eventId"));
  const episodeId = Number(url.searchParams.get("episodeId"));
  const atTime = url.searchParams.get("at") || new Date().toISOString();

  if (Number.isNaN(eventId) || Number.isNaN(episodeId)) {
    return NextResponse.json(
      { error: "Invalid eventId or episodeId" },
      { status: 400 }
    );
  }

  try {
    const track = await getStormTrack(eventId, episodeId, atTime);
    if (!track) {
      return NextResponse.json({ error: "Storm track not found" }, { status: 404 });
    }
    return NextResponse.json({ track });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
