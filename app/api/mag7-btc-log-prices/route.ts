// ========== Mag7 + BTC Historical Prices API ==========
// Uses Yahoo Finance chart data so equities and BTC share one source shape.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const COIN_METRICS_BASE = "https://community-api.coinmetrics.io/v4";
const CACHE_TTL = 30 * 60 * 1000;
const COMMON_START_DATE = "2012-05-18";

const RANGE_TO_YAHOO = {
  "6m": "6mo",
  "1y": "1y",
  "2y": "2y",
  "5y": "5y",
  max: "max",
} as const;

type RangeKey = keyof typeof RANGE_TO_YAHOO;

const DEFAULT_RANGE: RangeKey = "max";

const MAG7_SYMBOLS = [
  { symbol: "AAPL", yahooSymbol: "AAPL", name: "Apple", color: "#6b7280" },
  { symbol: "MSFT", yahooSymbol: "MSFT", name: "Microsoft", color: "#2563eb" },
  { symbol: "AMZN", yahooSymbol: "AMZN", name: "Amazon", color: "#f97316" },
  { symbol: "GOOGL", yahooSymbol: "GOOGL", name: "Alphabet", color: "#10b981" },
  { symbol: "META", yahooSymbol: "META", name: "Meta", color: "#8b5cf6" },
  { symbol: "NVDA", yahooSymbol: "NVDA", name: "NVIDIA", color: "#22c55e" },
  { symbol: "TSLA", yahooSymbol: "TSLA", name: "Tesla", color: "#ef4444" },
] as const;

const BTC_SYMBOL = {
  symbol: "BTC",
  yahooSymbol: "BTC-USD",
  name: "Bitcoin",
  color: "#f59e0b",
} as const;

const SYMBOLS = [
  ...MAG7_SYMBOLS,
  BTC_SYMBOL,
] as const;

interface PricePoint {
  date: string;
  price: number;
}

interface PriceSeries {
  symbol: string;
  name: string;
  color: string;
  points: PricePoint[];
  firstPrice: number;
  latestPrice: number;
  returnPct: number;
}

interface ApiResponse {
  range: RangeKey;
  updatedAt: string;
  series: PriceSeries[];
}

let cachedResults: Partial<Record<RangeKey, { timestamp: number; data: ApiResponse }>> = {};

function readRange(value: string | null): RangeKey {
  if (value && value in RANGE_TO_YAHOO) return value as RangeKey;
  return DEFAULT_RANGE;
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
}

function toUtcDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toUnixSeconds(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

async function fetchYahooHistory(
  yahooSymbol: string,
  range: RangeKey,
): Promise<PricePoint[]> {
  const url = new URL(`${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  if (range === "max") {
    url.searchParams.set("period1", String(toUnixSeconds(COMMON_START_DATE)));
    url.searchParams.set("period2", String(Math.floor(Date.now() / 1000)));
  } else {
    url.searchParams.set("range", RANGE_TO_YAHOO[range]);
  }

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo request failed for ${yahooSymbol}: ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close;

  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`Invalid Yahoo response for ${yahooSymbol}`);
  }

  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = readNumber(timestamps[i]);
    const price = readNumber(closes[i]);
    if (!ts || !price) continue;
    points.push({ date: toUtcDate(ts), price });
  }

  return points;
}

async function fetchCoinMetricsBitcoinHistory(): Promise<PricePoint[]> {
  const url = new URL(`${COIN_METRICS_BASE}/timeseries/asset-metrics`);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", COMMON_START_DATE);
  url.searchParams.set("page_size", "10000");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Coin Metrics request failed: ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json?.data)) {
    throw new Error("Invalid Coin Metrics response");
  }

  const points: PricePoint[] = [];
  for (const row of json.data as Array<{ time?: string; PriceUSD?: string | number }>) {
    const price = readNumber(row.PriceUSD);
    if (!row.time || !price) continue;
    points.push({ date: row.time.slice(0, 10), price });
  }

  return points;
}

async function fetchBitcoinHistory(range: RangeKey): Promise<PricePoint[]> {
  if (range === "max") {
    try {
      return await fetchCoinMetricsBitcoinHistory();
    } catch (err) {
      console.warn("[Mag7BtcLogPrices] Coin Metrics BTC fallback to Yahoo:", err);
    }
  }

  return fetchYahooHistory(BTC_SYMBOL.yahooSymbol, range);
}

export async function GET(request: NextRequest) {
  const range = readRange(request.nextUrl.searchParams.get("range"));
  const now = Date.now();
  const cached = cachedResults[range];

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  }

  try {
    const settled = await Promise.allSettled(
      SYMBOLS.map(async (meta): Promise<PriceSeries | null> => {
        const points = meta.symbol === "BTC"
          ? await fetchBitcoinHistory(range)
          : await fetchYahooHistory(meta.yahooSymbol, range);
        if (points.length < 2) return null;

        const firstPrice = points[0].price;
        const latestPrice = points[points.length - 1].price;
        return {
          symbol: meta.symbol,
          name: meta.name,
          color: meta.color,
          points,
          firstPrice,
          latestPrice,
          returnPct: ((latestPrice - firstPrice) / firstPrice) * 100,
        };
      }),
    );

    const series = settled
      .map((item) => (item.status === "fulfilled" ? item.value : null))
      .filter((item): item is PriceSeries => item !== null);

    if (series.length === 0) {
      return NextResponse.json(
        { error: "No Mag7/BTC historical price data available" },
        { status: 502 },
      );
    }

    const data: ApiResponse = {
      range,
      updatedAt: new Date().toISOString(),
      series,
    };

    cachedResults[range] = { timestamp: now, data };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[Mag7BtcLogPrices] fetch failed:", err);
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "s-maxage=300" },
      });
    }

    return NextResponse.json(
      { error: "Fetch failed", details: String(err) },
      { status: 500 },
    );
  }
}
