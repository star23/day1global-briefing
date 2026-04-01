// ========== 音频早报接口 ==========
// 从 Redis 读取 Blob URL，重定向到音频文件
// 若 Redis 缓存过期，自动从 Vercel Blob 按日期查找最新音频
// 前端通过此接口获取当日早报的 MP3 音频
// 支持 ?download=1 参数触发浏览器下载

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

async function findAudioUrl(): Promise<string | null> {
  // 1. 优先从 Redis 读取（24h TTL 缓存）
  const cached = await redis.get<string>("briefing-audio-url");
  if (cached) return cached;

  // 2. Redis 缓存过期，从 Vercel Blob 按日期查找
  // 先查今天，再查昨天（处理时区差异）
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const date of [today, yesterday]) {
    const result = await list({ prefix: `briefing-audio/${date}` });
    if (result.blobs.length > 0) {
      const url = result.blobs[0].url;
      // 重新写入 Redis 缓存（12h TTL）
      await redis.set("briefing-audio-url", url, { ex: 43200 });
      console.log(`[Audio] Redis 缓存已过期，从 Blob 恢复: ${url}`);
      return url;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const audioUrl = await findAudioUrl();

    if (!audioUrl) {
      return NextResponse.json(
        { error: "暂无音频早报" },
        { status: 404 }
      );
    }

    // 支持下载模式
    const isDownload = request.nextUrl.searchParams.get("download") === "1";
    if (isDownload) {
      const today = new Date().toISOString().slice(0, 10);
      const filename = `day1global-briefing-${today}.mp3`;
      return new NextResponse(null, {
        status: 302,
        headers: {
          Location: audioUrl,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // 重定向到 Vercel Blob URL
    return NextResponse.redirect(audioUrl);
  } catch (err) {
    console.error("读取音频早报失败:", err);
    return NextResponse.json(
      { error: "读取音频失败" },
      { status: 500 }
    );
  }
}
