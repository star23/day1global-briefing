import { NextResponse } from "next/server";
import { listDatSnapshots } from "@/lib/dat-weekly-archive";
import seed from "@/data/dat-weekly-initial.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshots = await listDatSnapshots();
    if (snapshots.length) return NextResponse.json({ snapshots, source: "database" }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[DAT archive] Read failed", error instanceof Error ? error.message : "unknown");
  }
  return NextResponse.json({ snapshots: seed.slice().reverse(), source: "initial-capture" }, {
    headers: { "Cache-Control": "s-maxage=60" },
  });
}
