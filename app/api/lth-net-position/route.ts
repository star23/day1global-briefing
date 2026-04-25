// ========== LTH 7日净持仓变化 API ==========
// 返回最近 90 天的 LTH 净持仓变化（今日 supply - 7天前 supply）
// 5 分钟内存缓存，避免频繁调用 CoinGlass

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

interface LTHDataPoint {
  timestamp: number;
  price: number;
  long_term_holder_supply: number;
}

interface LTHNetPositionPoint {
  date: string;
  timestamp: number;
  price: number;
  supply: number;
  netChange7d: number | null;
}

let cachedResult: LTHNetPositionPoint[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const now = Date.now();

  if (cachedResult && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  }

  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing COINGLASS_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/index/bitcoin-long-term-holder-supply`,
      {
        cache: "no-store",
        headers: { "CG-API-KEY": apiKey, accept: "application/json" },
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `CoinGlass request failed: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    if (json.code !== "0" || !Array.isArray(json.data)) {
      return NextResponse.json(
        { error: "Invalid CoinGlass response" },
        { status: 502 },
      );
    }

    const rawData: LTHDataPoint[] = json.data;

    // 计算每个点的 7 日净持仓变化
    const result: LTHNetPositionPoint[] = [];
    for (let i = 0; i < rawData.length; i++) {
      const point = rawData[i];
      const date = new Date(point.timestamp * 1000)
        .toISOString()
        .split("T")[0];

      let netChange7d: number | null = null;
      if (i >= 7) {
        netChange7d = Math.round(
          point.long_term_holder_supply -
            rawData[i - 7].long_term_holder_supply,
        );
      }

      result.push({
        date,
        timestamp: point.timestamp,
        price: point.price,
        supply: point.long_term_holder_supply,
        netChange7d,
      });
    }

    // 只返回最近 90 天
    const last90 = result.slice(-90);

    cachedResult = last90;
    cacheTimestamp = now;

    return NextResponse.json(last90, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[LTH Net Position] 获取失败:", err);
    if (cachedResult) {
      return NextResponse.json(cachedResult, {
        headers: { "Cache-Control": "s-maxage=60" },
      });
    }
    return NextResponse.json(
      { error: "获取失败", details: String(err) },
      { status: 500 },
    );
  }
}
