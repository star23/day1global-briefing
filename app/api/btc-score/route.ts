// ========== BTC 评分 API（供外部 Skill 调用）==========
// 轻量级端点：返回 BTC 抄底/逃顶评分 + 关键指标
// 5 分钟 CDN 缓存 + 内存缓存，最大程度减少外部 API 调用

import { NextResponse } from "next/server";
import { fetchAllCrypto } from "@/lib/fetch-crypto";
import { fetchFearGreedIndex } from "@/lib/fetch-fear-greed";
import { fetchBTCMetrics } from "@/lib/fetch-btc-metrics";
import { calculateMarketRating } from "@/lib/market-rating";
import { BTCMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

// ---- 内存缓存 ----
let cachedResult: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟内存缓存

export async function GET() {
  const now = Date.now();

  // 命中内存缓存直接返回
  if (cachedResult && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  }

  try {
    // 只请求 BTC 评分所需的数据（不拉股票/指数）
    const [crypto, sentiment, btcMetrics] = await Promise.all([
      fetchAllCrypto().catch(() => ({})),
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

    // 计算评分
    const rating = calculateMarketRating(
      btcMetrics as BTCMetrics,
      sentiment.cryptoFearGreed ?? null
    );

    // 组装精简响应
    const btcPrice = (crypto as Record<string, { price: number }>)?.BTC?.price ?? null;

    const result = {
      timestamp: new Date().toISOString(),
      btcPrice,
      // 抄底视角分数（与页面展示一致）：0=不适合买, 100=极度适合买
      score: Math.round((100 - rating.totalScore) * 10) / 10,
      dailyScore: Math.round((32 - rating.dailyScore) * 10) / 10,
      weeklyScore: Math.round((68 - rating.weeklyScore) * 10) / 10,
      level: rating.level,
      suggestion: rating.suggestion,
      indicators: rating.indicators,
      btcMetrics,
      fearGreed: sentiment.cryptoFearGreed,
    };

    // 更新缓存
    cachedResult = result;
    cacheTimestamp = now;

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[BTC Score] 计算失败:", err);
    // 如果有过期缓存，降级返回
    if (cachedResult) {
      return NextResponse.json(
        { ...cachedResult, _stale: true },
        { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } }
      );
    }
    return NextResponse.json(
      { error: "BTC 评分计算失败", details: String(err) },
      { status: 500 }
    );
  }
}
