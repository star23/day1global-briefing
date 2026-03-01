// ========== 定时任务接口 ==========
// Vercel Cron Job 每天定时调用此接口
// 1. 获取最新市场数据
// 2. 获取最新新闻
// 3. 调用 Claude AI 生成中文市场分析 + 精选新闻
// 4. 将分析结果存入 Upstash Redis 供前端读取
// 5. 推送到 Telegram（可通过 ?skip_telegram=true 跳过）

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { generateMarketAnalysis } from "@/lib/generate-analysis";
import { fetchNews } from "@/lib/fetch-news";
import { fetchGeopoliticalNews } from "@/lib/fetch-geopolitical-news";
import { pushTelegramBriefing } from "@/lib/telegram";
import { MarketDataResponse } from "@/lib/types";
import { ensureTable, upsertDailyMetrics } from "@/lib/db";

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

  // 检查是否跳过 Telegram 推送（测试用）
  const skipTelegram =
    request.nextUrl.searchParams.get("skip_telegram") === "true";

  try {
    // ---- 第一步：获取最新市场数据 ----
    const baseUrl =
      process.env.BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/market-data`);
    const data: MarketDataResponse = await res.json();

    console.log(`[Cron] 市场数据获取成功: ${data.timestamp}`);

    // ---- 第 1.5 步：将 BTC 指标写入 Postgres ----
    let metricsStored = false;
    try {
      await ensureTable();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      await upsertDailyMetrics({
        date: today,
        btcPrice: data.crypto?.BTC?.price ?? null,
        weeklyRsi: data.btcMetrics?.weeklyRsi ?? null,
        volume24h: data.btcMetrics?.volume24h ?? null,
        volumeChangePct: data.btcMetrics?.volumeChangePercent ?? null,
        sthSopr: data.btcMetrics?.sthSopr ?? null,
        lthSopr: data.btcMetrics?.lthSopr ?? null,
        lthSupplyPct: data.btcMetrics?.lthSupplyPercent ?? null,
        wma200Price: data.btcMetrics?.wma200Price ?? null,
        wma200Multiplier: data.btcMetrics?.wma200Multiplier ?? null,
        fearGreed: data.sentiment?.cryptoFearGreed ?? null,
      });
      metricsStored = true;
      console.log(`[Cron] BTC 指标已写入 Postgres (${today})`);
    } catch (dbErr) {
      console.error("[Cron] 写入 Postgres 失败:", dbErr);
    }

    // ---- 第二步：获取最新新闻 + 地缘政治新闻 ----
    const [rawNews, geoNews] = await Promise.all([
      fetchNews(),
      fetchGeopoliticalNews(),
    ]);
    console.log(`[Cron] 新闻获取完成: ${rawNews.length} 条`);
    console.log(`[Cron] 地缘新闻获取完成: 停火 ${geoNews.iranCeasefire.length} 条, 海峡 ${geoNews.hormuzStrait.length} 条`);

    // ---- 第三步：调用 Claude AI 生成分析 ----
    let analysisGenerated = false;
    let telegramPushed = false;
    let newsCount = 0;

    // 只有配置了 API Key 才尝试生成 AI 分析
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log("[Cron] 正在调用 Claude AI 生成市场分析...");
        const analysis = await generateMarketAnalysis(data, rawNews, geoNews);
        newsCount = analysis.topNews.length;

        // ---- 第四步：存入 Upstash Redis ----
        // 设置 24 小时过期（秒为单位），防止过期数据一直留着
        await redis.set("ai-analysis", analysis, { ex: 86400 });

        console.log(
          `[Cron] AI 分析已生成并存储: ${analysis.generatedAt}，精选新闻 ${newsCount} 条`
        );
        analysisGenerated = true;

        // ---- 第五步：推送到 Telegram ----
        if (!skipTelegram) {
          try {
            telegramPushed = await pushTelegramBriefing(data, analysis);
            if (telegramPushed) {
              console.log("[Cron] Telegram 推送成功");
            }
          } catch (tgErr) {
            console.error("[Cron] Telegram 推送失败:", tgErr);
          }
        } else {
          console.log("[Cron] skip_telegram=true，跳过 Telegram 推送");
        }
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
      metricsHistory: metricsStored ? "已写入" : "写入失败",
      aiAnalysis: analysisGenerated
        ? `已生成（含 ${newsCount} 条精选新闻）`
        : "未生成（缺少 API Key 或生成失败）",
      telegram: skipTelegram
        ? "已跳过（skip_telegram=true）"
        : telegramPushed
          ? "已推送"
          : "未推送",
    });
  } catch (err) {
    console.error("[Cron] 数据更新失败:", err);
    return NextResponse.json(
      { error: "数据更新失败", details: String(err) },
      { status: 500 }
    );
  }
}
