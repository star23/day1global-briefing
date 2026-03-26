// ========== 音频早报接口 ==========
// 从 Upstash Redis 读取 TTS 生成的早报音频
// 前端通过此接口获取当日早报的 MP3 音频流

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  try {
    // 从 Redis 读取 base64 编码的音频
    const audioBase64 = await redis.get<string>("briefing-audio");

    if (!audioBase64) {
      return NextResponse.json(
        { error: "暂无音频早报" },
        { status: 404 }
      );
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
        "Content-Disposition": 'inline; filename="day1global-briefing.mp3"',
      },
    });
  } catch (err) {
    console.error("读取音频早报失败:", err);
    return NextResponse.json(
      { error: "读取音频失败" },
      { status: 500 }
    );
  }
}
