// ========== 市场评级 API ==========
// 基于当前 BTC 指标计算抄底/逃顶综合评级
// 返回 MarketRating (含各指标评分明细)

import { NextResponse } from "next/server";
import { calculateMarketRating } from "@/lib/market-rating";
import { MarketDataResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 复用 /api/market-data 获取最新指标
    const baseUrl =
      process.env.BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/market-data`);
    if (!res.ok) {
      return NextResponse.json(
        { error: "获取市场数据失败" },
        { status: 502 }
      );
    }

    const data: MarketDataResponse = await res.json();
    const rating = calculateMarketRating(
      data.btcMetrics,
      data.sentiment?.cryptoFearGreed ?? null
    );

    return NextResponse.json(rating, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[MarketRating] 计算失败:", err);
    return NextResponse.json(
      { error: "评级计算失败", details: String(err) },
      { status: 500 }
    );
  }
}
