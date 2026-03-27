// ========== 独立 TTS 音频生成脚本 ==========
// 在 GitHub Actions 中运行，不受 Vercel 时间限制
// 1. 从线上 API 获取市场数据和 AI 分析
// 2. 生成 TTS 音频
// 3. 上传到 Vercel Blob
// 4. 更新 Redis URL
// 5. 推送音频到 Telegram

import { generateTTSAudio } from "../lib/tts";
import { pushTelegramAudio } from "../lib/telegram";
import { MarketDataResponse, AIAnalysis } from "../lib/types";
import { put } from "@vercel/blob";
import { Redis } from "@upstash/redis";

const BASE_URL = process.env.BRIEFING_BASE_URL || "https://brief.day1global.xyz";
const MAX_RETRIES = 6;         // 最多等 6 次
const RETRY_INTERVAL = 30_000; // 每次等 30 秒，共最多 3 分钟

/** 等待 AI 分析就绪（带重试） */
async function waitForAnalysis(): Promise<AIAnalysis> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  第 ${attempt}/${MAX_RETRIES} 次检查...`);
    const res = await fetch(`${BASE_URL}/api/analysis`);
    if (res.ok) {
      const analysis: AIAnalysis | null = await res.json();
      if (analysis) {
        // 检查分析是否是今天生成的（防止用了昨天的旧数据）
        const analysisDate = new Date(analysis.generatedAt).toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        if (analysisDate === today) {
          return analysis;
        }
        console.log(`  分析日期 ${analysisDate} 不是今天 ${today}，等待更新...`);
      } else {
        console.log("  分析尚未生成...");
      }
    } else {
      console.log(`  API 返回 ${res.status}...`);
    }

    if (attempt < MAX_RETRIES) {
      console.log(`  等待 ${RETRY_INTERVAL / 1000} 秒后重试...`);
      await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
    }
  }
  throw new Error(`等待 ${MAX_RETRIES * RETRY_INTERVAL / 1000} 秒后仍未获取到今天的 AI 分析，放弃`);
}

async function main() {
  console.log("=== Day1Global 音频早报生成 ===");
  console.log(`基础 URL: ${BASE_URL}`);
  console.log(`时间: ${new Date().toISOString()}`);

  // 检查必需的环境变量
  const required = ["OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`缺少环境变量: ${key}`);
      process.exit(1);
    }
  }

  // 1. 获取市场数据
  console.log("\n[1/5] 获取市场数据...");
  const dataRes = await fetch(`${BASE_URL}/api/market-data`);
  if (!dataRes.ok) {
    throw new Error(`获取市场数据失败: ${dataRes.status}`);
  }
  const data: MarketDataResponse = await dataRes.json();
  console.log(`  市场数据时间: ${data.timestamp}`);

  // 2. 获取 AI 分析（等待 cron 完成）
  console.log("[2/5] 获取 AI 分析...");
  const analysis = await waitForAnalysis();
  console.log(`  分析生成时间: ${analysis.generatedAt}`);

  // 3. 生成 TTS 音频
  console.log("[3/5] 生成 TTS 音频...");
  const audioBuffer = await generateTTSAudio(data, analysis);
  const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`  音频大小: ${sizeMB} MB`);

  // 4. 上传到 Vercel Blob + 更新 Redis
  console.log("[4/5] 上传到 Vercel Blob...");
  const today = new Date().toISOString().slice(0, 10);
  const blob = await put(`briefing-audio/${today}.mp3`, audioBuffer, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
  });
  console.log(`  Blob URL: ${blob.url}`);

  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  await redis.set("briefing-audio-url", blob.url, { ex: 86400 });
  console.log("  Redis URL 已更新 (24h TTL)");

  // 5. 推送到 Telegram
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    console.log("[5/5] 推送音频到 Telegram...");
    const pushed = await pushTelegramAudio(audioBuffer);
    console.log(pushed ? "  Telegram 推送成功" : "  Telegram 推送失败");
  } else {
    console.log("[5/5] 未设置 Telegram 环境变量，跳过推送");
  }

  console.log("\n=== 完成 ===");
  console.log(`音频 URL: ${blob.url}`);
  console.log(`Dashboard: ${BASE_URL} → 点击"听早报"`);
}

main().catch((err) => {
  console.error("音频生成失败:", err);
  process.exit(1);
});
