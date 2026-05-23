// ========== ETF 净流入历史 API ==========
// 返回最近 90 天的 BTC ETF 每日净流入 + 7日累计净流入
// 5 分钟内存缓存

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

interface ETFFlowPoint {
  date: string;
  price: number | null;
  flowUsd: number;
  flow7dSum: number | null;
}

let cachedResult: ETFFlowPoint[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function tsToDate(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
}

function readPrice(point: Record<string, unknown>): number | null {
  return (
    readNumber(point.price) ??
    readNumber(point.btc_price) ??
    readNumber(point.btcPrice) ??
    readNumber(point.close) ??
    readNumber(point.c)
  );
}

function readTimestamp(point: Record<string, unknown>): number | null {
  return (
    readNumber(point.timestamp) ??
    readNumber(point.time) ??
    readNumber(point.t) ??
    readNumber(point.date)
  );
}

async function fetchBtcPriceByDate(apiKey: string): Promise<Map<string, number>> {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/index/bitcoin-long-term-holder-supply`,
      {
        cache: "no-store",
        headers: { "CG-API-KEY": apiKey, accept: "application/json" },
      },
    );

    if (!res.ok) return new Map();

    const json = await res.json();
    if (json.code !== "0" || !Array.isArray(json.data)) return new Map();

    const priceByDate = new Map<string, number>();
    for (const point of json.data as Record<string, unknown>[]) {
      const timestamp = readTimestamp(point);
      const price = readPrice(point);
      if (timestamp && price) {
        priceByDate.set(tsToDate(timestamp), price);
      }
    }

    return priceByDate;
  } catch (err) {
    console.warn("[ETF Flow History] BTC price history fallback failed:", err);
    return new Map();
  }
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
    const [res, btcPriceByDate] = await Promise.all([
      fetch(
        `${COINGLASS_BASE}/api/etf/bitcoin/flow-history`,
        {
          cache: "no-store",
          headers: { "CG-API-KEY": apiKey, accept: "application/json" },
        },
      ),
      fetchBtcPriceByDate(apiKey),
    ]);

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

    const rawData: Record<string, unknown>[] = json.data;

    const result: ETFFlowPoint[] = [];
    for (let i = 0; i < rawData.length; i++) {
      const point = rawData[i];
      const date = tsToDate(readTimestamp(point) ?? Date.now());
      const flowUsd = Number(point.flow_usd) || 0;

      // 7 日累计净流入
      let flow7dSum: number | null = null;
      if (i >= 6) {
        let sum = 0;
        for (let j = i - 6; j <= i; j++) {
          sum += Number(rawData[j].flow_usd) || 0;
        }
        flow7dSum = Math.round(sum);
      }

      result.push({
        date,
        price: readPrice(point) ?? btcPriceByDate.get(date) ?? null,
        flowUsd: Math.round(flowUsd),
        flow7dSum,
      });
    }

    // 最近 90 天
    const last90 = result.slice(-90);

    cachedResult = last90;
    cacheTimestamp = now;

    return NextResponse.json(last90, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[ETF Flow History] 获取失败:", err);
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
