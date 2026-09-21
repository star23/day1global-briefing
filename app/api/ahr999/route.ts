// ========== AHR999 轻量级公开 API ==========
// GET /api/ahr999
// 只读取每日快照，不在用户请求时调用 CoinGlass 或其他行情接口

import { NextResponse } from "next/server";
import { getLatestAhr999 } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ahr999Response = {
  date: string;
  ahr999: number;
  btcPrice: number | null;
  updatedAt: string;
};

const MEMORY_CACHE_TTL = 60 * 60 * 1000;
const CACHE_HEADERS = {
  // Short client cache; Vercel keeps the shared response for one hour.
  "Cache-Control": "public, max-age=300",
  "Vercel-CDN-Cache-Control":
    "public, max-age=3600, stale-while-revalidate=86400",
};
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

let cachedResult: Ahr999Response | null = null;
let cacheTimestamp = 0;

function formatTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export async function GET() {
  const now = Date.now();

  if (cachedResult && now - cacheTimestamp < MEMORY_CACHE_TTL) {
    return NextResponse.json(cachedResult, { headers: CACHE_HEADERS });
  }

  try {
    const row = await getLatestAhr999();

    if (!row) {
      return NextResponse.json(
        { error: "暂无 AHR999 数据" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const ahr999 = Number(row.ahr999);
    if (!Number.isFinite(ahr999)) {
      throw new Error("数据库中的 AHR999 数据无效");
    }

    const btcPrice = row.btc_price == null ? null : Number(row.btc_price);
    const result: Ahr999Response = {
      date: String(row.date),
      ahr999,
      btcPrice: btcPrice !== null && Number.isFinite(btcPrice) ? btcPrice : null,
      updatedAt: formatTimestamp(row.created_at),
    };

    cachedResult = result;
    cacheTimestamp = now;

    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[AHR999] 查询失败:", err);

    if (cachedResult) {
      return NextResponse.json(
        { ...cachedResult, stale: true },
        {
          headers: {
            "Cache-Control": "public, max-age=60",
            "Vercel-CDN-Cache-Control":
              "public, max-age=300, stale-while-revalidate=3600",
          },
        }
      );
    }

    return NextResponse.json(
      { error: "AHR999 查询失败" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
