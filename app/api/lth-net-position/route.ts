// ========== LTH 净持仓变化 API ==========
// 返回最近 90 天的 LTH 每日净持仓变化 + 7日净持仓变化
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
  price: number;
  supply: number;
  netChange1d: number | null;
  netChange7d: number | null;
}

let cachedResult: LTHNetPositionPoint[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function tsToDate(ts: number): string {
  // CoinGlass timestamp 可能是秒或毫秒
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

    const result: LTHNetPositionPoint[] = [];
    for (let i = 0; i < rawData.length; i++) {
      const point = rawData[i];

      const netChange1d = i >= 1
        ? Math.round(point.long_term_holder_supply - rawData[i - 1].long_term_holder_supply)
        : null;

      const netChange7d = i >= 7
        ? Math.round(point.long_term_holder_supply - rawData[i - 7].long_term_holder_supply)
        : null;

      result.push({
        date: tsToDate(point.timestamp),
        price: point.price,
        supply: point.long_term_holder_supply,
        netChange1d,
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
