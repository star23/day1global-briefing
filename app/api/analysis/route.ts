// ========== AI 分析读取接口 ==========
// 从 Upstash Redis 读取 AI 生成的市场分析内容
// 前端通过此接口获取最新的 AI 分析

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { AIAnalysis } from "@/lib/types";

// 强制动态渲染
export const dynamic = "force-dynamic";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  try {
    // 从 Upstash Redis 读取最新的 AI 分析
    const analysis = await redis.get<AIAnalysis>("ai-analysis");

    if (!analysis) {
      // 如果没有数据（比如还没跑过 cron），返回 null
      return NextResponse.json(null, {
        headers: {
          // 没数据时缓存 1 分钟（很快会有数据）
          "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
        },
      });
    }

    return NextResponse.json(analysis, {
      headers: {
        // AI 分析每天只更新一次，缓存 5 分钟
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("读取 AI 分析失败:", err);
    // KV 连接失败时返回 null（前端会使用回退内容）
    return NextResponse.json(null, { status: 200 });
  }
}
