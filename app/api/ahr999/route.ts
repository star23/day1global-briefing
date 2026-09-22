// ========== AHR999 轻量级公开 API ==========
// GET /api/ahr999
// 优先读取缓存和每日快照；数据库暂无数据时只请求 CoinGlass AHR999

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getLatestAhr999 } from "@/lib/db";
import { fetchLatestAhr999 } from "@/lib/fetch-btc-metrics";

export const dynamic = "force-dynamic";

type Ahr999Response = {
  date: string;
  ahr999: number;
  btcPrice: number | null;
  updatedAt: string;
  stale?: boolean;
};

const MEMORY_CACHE_TTL = 15 * 60 * 1000;
const SHARED_CACHE_TTL = 60 * 60;
const CACHE_HEADERS = {
  // Keep the edge cache short enough to pick up intraday CoinGlass updates.
  "Cache-Control": "public, max-age=300",
  "Vercel-CDN-Cache-Control":
    "public, max-age=900, stale-while-revalidate=3600",
};
const STALE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "Vercel-CDN-Cache-Control":
    "public, max-age=300, stale-while-revalidate=600",
};
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

let cachedResult: Ahr999Response | null = null;
let cacheTimestamp = 0;

function createRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: unknown): string {
  return String(value || "").slice(0, 10).replace(/\//g, "-");
}

function isCurrent(result: Ahr999Response | null, today: string): boolean {
  return Boolean(result && result.date === today && !result.stale);
}

function formatTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export async function GET() {
  const now = Date.now();
  const today = getTodayUtc();
  const redisKey = `ahr999:latest:v2:${today}`;

  if (
    isCurrent(cachedResult, today) &&
    now - cacheTimestamp < MEMORY_CACHE_TTL
  ) {
    return NextResponse.json(cachedResult, { headers: CACHE_HEADERS });
  }

  try {
    const redis = createRedis();
    if (redis) {
      try {
        const shared = await redis.get<Ahr999Response>(redisKey);
        if (
          shared &&
          normalizeDate(shared.date) === today &&
          Number.isFinite(Number(shared.ahr999))
        ) {
          cachedResult = {
            ...shared,
            date: today,
            ahr999: Number(shared.ahr999),
            stale: false,
          };
          cacheTimestamp = now;
          return NextResponse.json(cachedResult, { headers: CACHE_HEADERS });
        }
      } catch (err) {
        console.warn("[AHR999] Redis 读取失败，继续查询数据源:", err);
      }
    }

    let result: Ahr999Response | null = null;
    let fallback: Ahr999Response | null = cachedResult;

    try {
      const row = await getLatestAhr999();
      if (row) {
        const ahr999 = Number(row.ahr999);
        const btcPrice = row.btc_price == null ? null : Number(row.btc_price);

        if (Number.isFinite(ahr999)) {
          const databaseResult: Ahr999Response = {
            date: normalizeDate(row.date),
            ahr999,
            btcPrice:
              btcPrice !== null && Number.isFinite(btcPrice) ? btcPrice : null,
            updatedAt: formatTimestamp(row.created_at),
          };

          if (!fallback || databaseResult.date >= fallback.date) {
            fallback = databaseResult;
          }
        }
      }
    } catch (err) {
      console.warn("[AHR999] 数据库查询失败，降级到 CoinGlass:", err);
    }

    // The daily database row is always a fallback. After the hourly shared cache
    // expires, ask CoinGlass again so same-day updates are not masked by the DB.
    if (!result) {
      const latest = await fetchLatestAhr999();
      if (latest) {
        const coinGlassResult: Ahr999Response = {
          ...latest,
          date: normalizeDate(latest.date),
          updatedAt: new Date().toISOString(),
        };

        if (coinGlassResult.date === today) {
          result = coinGlassResult;
        } else if (!fallback || coinGlassResult.date >= fallback.date) {
          fallback = coinGlassResult;
        }
      }
    }

    if (!isCurrent(result, today) && fallback) {
      cachedResult = { ...fallback, stale: true };
      cacheTimestamp = now;
      return NextResponse.json(cachedResult, {
        headers: STALE_CACHE_HEADERS,
      });
    }

    if (!result) {
      throw new Error("数据库和 CoinGlass 均无可用 AHR999 数据");
    }

    cachedResult = { ...result, stale: false };
    cacheTimestamp = now;

    if (redis) {
      try {
        await redis.set(redisKey, cachedResult, { ex: SHARED_CACHE_TTL });
      } catch (err) {
        console.warn("[AHR999] Redis 写入失败，继续返回结果:", err);
      }
    }

    return NextResponse.json(cachedResult, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[AHR999] 查询失败:", err);

    if (cachedResult) {
      return NextResponse.json(
        { ...cachedResult, stale: true },
        { headers: STALE_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: "AHR999 查询失败" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
