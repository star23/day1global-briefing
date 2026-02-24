// ========== 定时任务接口 ==========
// Vercel Cron Job 每天定时调用此接口
// 1. 获取最新市场数据
// 2. 调用 Claude AI 生成中文市场分析
// 3. 将分析结果存入 Upstash Redis 供前端读取

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { generateMarketAnalysis } from "@/lib/generate-analysis";
import { MarketDataResponse } from "@/lib/types";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(request: NextRequest) {
  // 验证 CRON_SECRET，防止被随意调用
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 如果设置了 CRON_SECRET，则必须验证
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授权访问" }, { status: 401 });
  }

  try {
    // ---- 第一步：获取最新市场数据 ----
    const baseUrl = process.env.BASE_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/market-data`);
    const data: MarketDataResponse = await res.json();

    console.log(`[Cron] 市场数据获取成功: ${data.timestamp}`);

    // ---- 第二步：调用 Claude AI 生成分析 ----
    let analysisGenerated = false;

    // 只有配置了 API Key 才尝试生成 AI 分析
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log("[Cron] 正在调用 Claude AI 生成市场分析...");
        const analysis = await generateMarketAnalysis(data);

        // ---- 第三步：存入 Upstash Redis ----
        // 设置 24 小时过期（秒为单位），防止过期数据一直留着
        await redis.set("ai-analysis", analysis, { ex: 86400 });

        console.log(`[Cron] AI 分析已生成并存储: ${analysis.generatedAt}`);
        analysisGenerated = true;
      } catch (aiErr) {
        // AI 生成失败不影响整体流程，市场数据更新仍然成功
        console.error("[Cron] AI 分析生成失败:", aiErr);
      }
    } else {
      console.log("[Cron] 未设置 ANTHROPIC_API_KEY，跳过 AI 分析生成");
    }

    return NextResponse.json({
      success: true,
      timestamp: data.timestamp,
      message: "数据已更新",
      aiAnalysis: analysisGenerated ? "已生成" : "未生成（缺少 API Key 或生成失败）",
    });
  } catch (err) {
    console.error("[Cron] 数据更新失败:", err);
    return NextResponse.json(
      { error: "数据更新失败", details: String(err) },
      { status: 500 }
    );
  }
}
