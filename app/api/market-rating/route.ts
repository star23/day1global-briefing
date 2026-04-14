// ========== 市场评级 API ==========
// 基于当前 BTC 指标计算抄底/逃顶综合评级
// 返回 MarketRating (含各指标评分明细)
// 直接调用数据获取函数，避免内部 HTTP 请求穿透缓存

import { NextResponse } from "next/server";
import { calculateMarketRating } from "@/lib/market-rating";
import { fetchAllCrypto } from "@/lib/fetch-crypto";
import { fetchFearGreedIndex } from "@/lib/fetch-fear-greed";
import { fetchBTCMetrics } from "@/lib/fetch-btc-metrics";
import { BTCMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

// ---- 内存缓存 ----
let cachedRating: ReturnType<typeof calculateMarketRating> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 120 * 1000; // 2 分钟内存缓存

export async function GET() {
  const now = Date.now();

  // 命中缓存直接返回
  if (cachedRating && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedRating, {
      headers: {
        "Cache-Control": "s-maxage=120, stale-while-revalidate=300",
      },
    });
  }

  try {
    // 直接调用数据源函数，不再 fetch 自身 API
    const [sentiment, btcMetrics] = await Promise.all([
      fetchFearGreedIndex().catch(() => ({
        cryptoFearGreed: 50,
        cryptoFearGreedLabel: "Neutral",
        cryptoFearGreedPrev: null,
        cryptoFearGreedChange: null,
        cnnFearGreed: null,
        cnnFearGreedLabel: null,
      })),
      fetchBTCMetrics().catch(() => ({
        weeklyRsi: null,
        volume24h: null,
        volumeChangePercent: null,
        sthSopr: null,
        lthSopr: null,
        lthSupplyPercent: null,
        wma200Price: null,
        wma200Multiplier: null,
        nupl: null,
        lthMvrv: null,
        ma365Price: null,
        ma365Ratio: null,
        etfFlowUsd: null,
        etfFlowDays: [] as number[],
        fundingRate: null,
        longShortRatio: null,
      })),
    ]);

    const rating = calculateMarketRating(
      btcMetrics as BTCMetrics,
      sentiment.cryptoFearGreed ?? null
    );

    // 更新缓存
    cachedRating = rating;
    cacheTimestamp = now;

    return NextResponse.json(rating, {
      headers: {
        "Cache-Control": "s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[MarketRating] 计算失败:", err);
    return NextResponse.json(
      { error: "评级计算失败", details: String(err) },
      { status: 500 },
    );
  }
}
