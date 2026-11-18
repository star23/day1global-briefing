import { NextResponse } from "next/server";
import { buildDatReport, datCompanies, readPurchases, type CompanyFeed, type DatCompanyId } from "@/lib/dat-weekly";

export const dynamic = "force-dynamic";

async function loadCompany(id: DatCompanyId): Promise<CompanyFeed> {
  const url = `https://api.coingecko.com/api/v3/public_treasury/${id}/transaction_history?coin_ids=bitcoin&order=date_desc&per_page=250`;
  const key = process.env.COINGECKO_API_KEY;
  try {
    const res = await fetch(url, {
      headers: key ? { "x-cg-demo-api-key": key } : {},
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    return { id, purchases: readPurchases(await res.json()) };
  } catch (error) {
    console.warn(`[DAT weekly] ${id}:`, error instanceof Error ? error.message : "unavailable");
    return { id, purchases: null };
  }
}

export async function GET() {
  const feeds = await Promise.all(datCompanies.map(c => loadCompany(c.id)));
  const report = buildDatReport(feeds, Date.now());
  if (report.unavailable.length === datCompanies.length) {
    return NextResponse.json({ error: "企业买入数据暂不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(report, { headers: {
    "Cache-Control": report.unavailable.length ? "s-maxage=60" : "s-maxage=3600, stale-while-revalidate=300",
  } });
}
