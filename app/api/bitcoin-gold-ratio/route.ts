// ========== Bitcoin / Gold Ratio API ==========
// Ratio = BTC market cap / estimated above-ground gold market cap
// Gold market cap uses XAUT-USDT daily close as gold price proxy.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const OKX_BASE = "https://www.okx.com";

const RANGE_DAYS = {
  "1m": 30,
  "3m": 90,
  "1y": 365,
  "2y": 730,
  "4y": 1460,
} as const;

type RangeKey = keyof typeof RANGE_DAYS;

const DEFAULT_RANGE: RangeKey = "1y";
const CACHE_TTL = 30 * 60 * 1000;
const TROY_OUNCES_PER_TONNE = 32150.74656862798;
// World Gold Council above-ground stock estimate, end-2025.
const GOLD_ABOVE_GROUND_TONNES = 219_891;
const GOLD_ABOVE_GROUND_OUNCES = GOLD_ABOVE_GROUND_TONNES * TROY_OUNCES_PER_TONNE;

interface BitcoinGoldRatioPoint {
  date: string;
  ratioPct: number;
  btcMarketCap: number;
  goldMarketCap: number;
  btcPrice: number;
  goldPrice: number;
}

let cachedResults: Partial<Record<RangeKey, { timestamp: number; data: BitcoinGoldRatioPoint[] }>> = {};

function toUtcDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
}

function readRange(value: string | null): RangeKey {
  if (value && value in RANGE_DAYS) return value as RangeKey;
  return DEFAULT_RANGE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBitcoinMarketChart(days: number): Promise<{
  btcPriceByDate: Map<string, number>;
  btcMarketCapByDate: Map<string, number>;
}> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const res = await fetch(
    `${COINGECKO_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    { cache: "no-store", headers },
  );

  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json.prices) || !Array.isArray(json.market_caps)) {
    throw new Error("Invalid CoinGecko response");
  }

  const btcPriceByDate = new Map<string, number>();
  for (const row of json.prices as unknown[][]) {
    const ts = readNumber(row[0]);
    const price = readNumber(row[1]);
    if (ts && price) btcPriceByDate.set(toUtcDate(ts), price);
  }

  const btcMarketCapByDate = new Map<string, number>();
  for (const row of json.market_caps as unknown[][]) {
    const ts = readNumber(row[0]);
    const marketCap = readNumber(row[1]);
    if (ts && marketCap) btcMarketCapByDate.set(toUtcDate(ts), marketCap);
  }

  return { btcPriceByDate, btcMarketCapByDate };
}

function estimateBitcoinSupply(date: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const dateMs = new Date(`${date}T00:00:00Z`).getTime();
  const halving2016 = Date.UTC(2016, 6, 9);
  const halving2020 = Date.UTC(2020, 4, 11);
  const halving2024 = Date.UTC(2024, 3, 20);

  if (dateMs < halving2020) {
    const daysSince2016 = Math.max(0, Math.floor((dateMs - halving2016) / dayMs));
    return Math.min(21_000_000, 15_750_000 + daysSince2016 * 1_800);
  }

  if (dateMs < halving2024) {
    const daysSince2020 = Math.max(0, Math.floor((dateMs - halving2020) / dayMs));
    return Math.min(21_000_000, 18_375_000 + daysSince2020 * 900);
  }

  const daysSince2024 = Math.max(0, Math.floor((dateMs - halving2024) / dayMs));
  return Math.min(21_000_000, 19_687_500 + daysSince2024 * 450);
}

async function fetchBitcoinMarketData(days: number): Promise<{
  btcPriceByDate: Map<string, number>;
  btcMarketCapByDate: Map<string, number>;
}> {
  if (days <= 365 || process.env.COINGECKO_API_KEY) {
    try {
      return await fetchBitcoinMarketChart(days);
    } catch (err) {
      console.warn("[BitcoinGoldRatio] CoinGecko market cap fallback to OKX candles:", err);
    }
  }

  const btcPriceByDate = await fetchDailyCloseByDate("BTC-USDT", days);
  const btcMarketCapByDate = new Map<string, number>();
  for (const [date, price] of Array.from(btcPriceByDate.entries())) {
    btcMarketCapByDate.set(date, price * estimateBitcoinSupply(date));
  }

  return { btcPriceByDate, btcMarketCapByDate };
}

async function fetchOkxJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (res.status !== 429 || attempt === 3) {
      if (!res.ok) {
        throw new Error(`OKX request failed: ${res.status}`);
      }
      return res.json();
    }

    await sleep(700 * (attempt + 1));
  }
}

async function fetchDailyCloseByDate(instId: string, days: number): Promise<Map<string, number>> {
  const closeByDate = new Map<string, number>();
  let after: string | null = null;
  let previousOldest: string | null = null;
  const targetRows = days + 10;
  const maxLoops = Math.ceil(targetRows / 100) + 3;

  for (let loop = 0; loop < maxLoops && closeByDate.size < targetRows; loop++) {
    const url = new URL(`${OKX_BASE}/api/v5/market/history-candles`);
    url.searchParams.set("instId", instId);
    url.searchParams.set("bar", "1D");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const json = await fetchOkxJson(url.toString());
    if (json.code !== "0" || !Array.isArray(json.data)) {
      throw new Error("Invalid OKX response");
    }
    if (json.data.length === 0) break;

    for (const row of json.data as unknown[][]) {
      const ts = readNumber(row[0]);
      const close = readNumber(row[4]);
      if (ts && close) closeByDate.set(toUtcDate(ts), close);
    }

    const oldest = String(json.data[json.data.length - 1]?.[0] ?? "");
    if (!oldest || oldest === previousOldest) break;
    previousOldest = oldest;
    after = oldest;
    await sleep(150);
  }

  return closeByDate;
}

export async function GET(request: NextRequest) {
  const range = readRange(request.nextUrl.searchParams.get("range"));
  const days = RANGE_DAYS[range];
  const now = Date.now();
  const cached = cachedResults[range];

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  }

  try {
    const { btcPriceByDate, btcMarketCapByDate } = await fetchBitcoinMarketData(days);
    const goldPriceByDate = await fetchDailyCloseByDate("XAUT-USDT", days);

    const data: BitcoinGoldRatioPoint[] = Array.from(btcMarketCapByDate.keys())
      .sort()
      .map((date) => {
        const btcMarketCap = btcMarketCapByDate.get(date);
        const btcPrice = btcPriceByDate.get(date);
        const goldPrice = goldPriceByDate.get(date);
        if (!btcMarketCap || !btcPrice || !goldPrice) return null;

        const goldMarketCap = goldPrice * GOLD_ABOVE_GROUND_OUNCES;
        return {
          date,
          ratioPct: (btcMarketCap / goldMarketCap) * 100,
          btcMarketCap,
          goldMarketCap,
          btcPrice,
          goldPrice,
        };
      })
      .filter((point): point is BitcoinGoldRatioPoint => point !== null)
      .slice(-days);

    if (data.length === 0) {
      return NextResponse.json(
        { error: "No Bitcoin/Gold ratio data available" },
        { status: 502 },
      );
    }

    cachedResults[range] = { timestamp: now, data };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[BitcoinGoldRatio] 获取失败:", err);
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "s-maxage=300" },
      });
    }
    return NextResponse.json(
      { error: "获取失败", details: String(err) },
      { status: 500 },
    );
  }
}
