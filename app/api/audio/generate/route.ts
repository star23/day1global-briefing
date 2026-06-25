// ========== 单独生成音频早报 ==========
// 从 Redis 读取已有的 AI 分析，配合实时市场数据生成 TTS 音频
// 不会触发 Telegram 推送，不会重新生成 AI 分析
// 用法: GET /api/audio/generate?secret=xxx

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { generateTTSAudio } from "@/lib/tts";
import { AIAnalysis, MarketDataResponse } from "@/lib/types";
import { getTodayBeijing } from "@/lib/date-utils";
import { cleanupOldBriefingAudio, uploadBriefingAudio } from "@/lib/audio-blob";

export const maxDuration = 300; // TTS 生成可能较慢，允许 5 分钟

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(request: NextRequest) {
  // 验证密钥
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "未设置 OPENAI_API_KEY" }, { status: 500 });
  }

  try {
    // 从 Redis 读取已有的 AI 分析
    const analysis = await redis.get<AIAnalysis>("ai-analysis");
    if (!analysis) {
      return NextResponse.json(
        { error: "Redis 中没有找到今天的 AI 分析，请先运行 cron" },
        { status: 404 }
      );
    }

    // 获取最新市场数据
    const baseUrl =
      process.env.BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/market-data`);
    const data: MarketDataResponse = await res.json();

    console.log("[Audio Generate] 开始生成 TTS 音频...");
    const audioBuffer = await generateTTSAudio(data, analysis);

    // 上传到 Vercel Blob
    const today = getTodayBeijing();
    const blob = await uploadBriefingAudio(today, audioBuffer);

    // 在 Redis 只存 URL（很小），24h 过期
    await redis.set("briefing-audio-url", blob.url, { ex: 86400 });

    console.log(`[Audio Generate] 音频已生成并上传 (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB) → ${blob.url}`);

    let cleanup = null;
    try {
      cleanup = await cleanupOldBriefingAudio();
      console.log(
        `[Audio Generate] 旧音频清理完成: 删除 ${cleanup.deleted} 个，保留最近 ${cleanup.retentionDays} 天`
      );
    } catch (cleanupErr) {
      console.error("[Audio Generate] 旧音频清理失败:", cleanupErr);
    }

    return NextResponse.json({
      success: true,
      size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      url: blob.url,
      analysisFrom: analysis.generatedAt,
      cleanup: cleanup
        ? {
            retentionDays: cleanup.retentionDays,
            cutoffDate: cleanup.cutoffDate,
            scanned: cleanup.scanned,
            kept: cleanup.kept,
            deleted: cleanup.deleted,
            skipped: cleanup.skipped,
          }
        : null,
      message: "音频已生成，可通过 /api/audio 收听，未推送 Telegram",
    });
  } catch (err) {
    console.error("[Audio Generate] 失败:", err);
    return NextResponse.json(
      { error: "音频生成失败", details: String(err) },
      { status: 500 }
    );
  }
}
