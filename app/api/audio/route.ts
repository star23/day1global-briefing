// ========== 音频早报接口 ==========
// 从 Redis 读取 Blob URL，重定向到音频文件
// 前端通过此接口获取当日早报的 MP3 音频

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  try {
    const audioUrl = await redis.get<string>("briefing-audio-url");

    if (!audioUrl) {
      return NextResponse.json(
        { error: "暂无音频早报" },
        { status: 404 }
      );
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
