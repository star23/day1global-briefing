// ========== BTC 指标历史对比 ==========
// GET /api/metrics-history
// 返回昨天、一周前、一个月前的 BTC 指标数据

import { NextResponse } from "next/server";
import { getComparisonMetrics } from "@/lib/db";

export const dynamic = "force-dynamic";

let cachedResult: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
    });
  }

  try {
    const rows = await getComparisonMetrics();

    // 转换为 { yesterday, oneWeek, oneMonth } 结构
    const result: Record<string, Record<string, unknown> | null> = {
      yesterday: null,
      oneWeek: null,
      oneMonth: null,
    };

    for (const row of rows) {
      if (!row.date) continue; // LEFT JOIN 可能返回空行
      const mapped = {
        date: row.date,
        btcPrice: row.btc_price ? Number(row.btc_price) : null,
        weeklyRsi: row.weekly_rsi ? Number(row.weekly_rsi) : null,
        volume24h: row.volume_24h ? Number(row.volume_24h) : null,
        volumeChangePct: row.volume_change_pct
          ? Number(row.volume_change_pct)
          : null,
        sthSopr: row.sth_sopr ? Number(row.sth_sopr) : null,
        lthSopr: row.lth_sopr ? Number(row.lth_sopr) : null,
        lthSupplyPct: row.lth_supply_pct
          ? Number(row.lth_supply_pct)
          : null,
        wma200Price: row.wma200_price ? Number(row.wma200_price) : null,
        wma200Multiplier: row.wma200_multiplier
          ? Number(row.wma200_multiplier)
          : null,
        fearGreed: row.fear_greed ? Number(row.fear_greed) : null,
        nupl: row.nupl != null ? Number(row.nupl) : null,
        lthMvrv: row.lth_mvrv != null ? Number(row.lth_mvrv) : null,
        ma365Price: row.ma365_price ? Number(row.ma365_price) : null,
        ma365Ratio: row.ma365_ratio ? Number(row.ma365_ratio) : null,
        etfFlowUsd: row.etf_flow_usd != null ? Number(row.etf_flow_usd) : null,
        fundingRate: row.funding_rate != null ? Number(row.funding_rate) : null,
        longShortRatio: row.long_short_ratio != null ? Number(row.long_short_ratio) : null,
      };

      switch (row.label) {
        case "yesterday":
          result.yesterday = mapped;
          break;
        case "1w":
          result.oneWeek = mapped;
          break;
        case "1m":
          result.oneMonth = mapped;
          break;
      }
    }

    cachedResult = result;
    cacheTimestamp = now;

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "s-maxage=600, stale-while-revalidate=1200",
      },
    });
  } catch (err) {
    console.error("[MetricsHistory] 查询失败:", err);
    if (cachedResult) {
      return NextResponse.json(cachedResult, {
        headers: { "Cache-Control": "s-maxage=60" },
      });
    }
    return NextResponse.json(
      { error: "查询失败", details: String(err) },
      { status: 500 }
    );
  }
}
