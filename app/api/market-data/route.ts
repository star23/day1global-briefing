// ========== 市场数据 API ==========
// 聚合所有数据源，返回完整的市场数据
// 包含 10 秒内存缓存，防止频繁请求被限流

import { NextResponse } from "next/server";
import { fetchAllStocks, fetchIndices } from "@/lib/fetch-stocks";
import { fetchAllCrypto } from "@/lib/fetch-crypto";
import { fetchFearGreedIndex } from "@/lib/fetch-fear-greed";
import { fetchCNNFearGreed } from "@/lib/fetch-cnn-fear-greed";
import { fetchBTCMetrics } from "@/lib/fetch-btc-metrics";
import { MarketDataResponse } from "@/lib/types";

// 强制动态渲染（不在构建时预渲染）
export const dynamic = "force-dynamic";

// ---- 内存缓存 ----
// 缓存最近一次成功获取的数据，60秒内不重复请求外部API
let cachedData: MarketDataResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 60 秒内存缓存（防止外部 API 限流）

export async function GET() {
  // 检查缓存是否有效（10秒内）
  const now = Date.now();
  if (cachedData && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: {
        // CDN 缓存 30 秒，过期后可用旧数据 60 秒（同时后台刷新）
        "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      },
    });
  }

  // 并发请求所有数据源（某个失败不影响其他）
  const [stocks, crypto, indices, sentiment, cnnFearGreed, btcMetrics] = await Promise.all([
    fetchAllStocks().catch((err) => {
      console.error("获取股票数据失败:", err);
      return {};
    }),
    fetchAllCrypto().catch((err) => {
      console.error("获取加密货币数据失败:", err);
      return {};
    }),
    fetchIndices().catch((err) => {
      console.error("获取指数数据失败:", err);
      return { vix: null, gold: null };
    }),
    fetchFearGreedIndex().catch((err) => {
      console.error("获取恐慌贪婪指数失败:", err);
      return { cryptoFearGreed: 50, cryptoFearGreedLabel: "Neutral", cnnFearGreed: null, cnnFearGreedLabel: null };
    }),
    fetchCNNFearGreed().catch((err) => {
      console.error("获取 CNN Fear & Greed 失败:", err);
      return null;
    }),
    fetchBTCMetrics().catch((err) => {
      console.error("获取 BTC metrics 失败:", err);
      return { weeklyRsi: null, volume24h: null, volumeChangePercent: null, sthSopr: null, lthSopr: null, lthSupplyPercent: null, wma200Price: null, wma200Multiplier: null };
    }),
  ]);

  // 组装返回数据
  const responseData: MarketDataResponse = {
    timestamp: new Date().toISOString(),
    stocks,
    crypto,
    indices: {
      vix: indices.vix ?? { price: 0, changePercent: 0 },
      gold: indices.gold ?? { price: 0, changePercent: 0 },
    },
    sentiment: {
      ...sentiment,
      cnnFearGreed: cnnFearGreed?.score ?? null,
      cnnFearGreedLabel: cnnFearGreed?.label ?? null,
    },
    btcMetrics,
  };

  // 更新缓存
  cachedData = responseData;
  cacheTimestamp = now;

  return NextResponse.json(responseData, {
    headers: {
      // 不使用 CDN 缓存，靠内存缓存(10s)和前端 SWR(5min) 控制频率
      // CDN 缓存 30 秒，过期后可用旧数据 60 秒（同时后台刷新）
        "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
    },
  });
}
