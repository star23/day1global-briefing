// ========== Day1Global 每日早报完整流程 ==========
// 在 GitHub Actions 中运行，替代 Vercel Cron
// 1. 获取市场数据（通过 Vercel API）
// 2. 存储 BTC 指标到 Postgres
// 3. 获取新闻 + 地缘新闻
// 4. 调用 Claude AI 生成分析
// 5. 存入 Redis
// 6. 生成 TTS 音频 + 上传 Blob
// 7. 推送 Telegram（音频在前，文字在后）

import { MarketDataResponse } from "../lib/types";
import { fetchNews } from "../lib/fetch-news";
import { fetchGeopoliticalNews } from "../lib/fetch-geopolitical-news";
import { generateMarketAnalysis } from "../lib/generate-analysis";
import { pushTelegramBriefing, pushTelegramAudio } from "../lib/telegram";
import { generateTTSAudio } from "../lib/tts";
import { ensureTable, migrateAddColumns, upsertDailyMetrics } from "../lib/db";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import { getTodayBeijing } from "../lib/date-utils";

const BASE_URL = process.env.BRIEFING_BASE_URL || "https://brief.day1global.xyz";
const skipTelegram = process.argv.includes("--skip-telegram");
const telegramAudioOnly = process.argv.includes("--telegram-audio-only");
const telegramTextOnly = process.argv.includes("--telegram-text-only");

async function main() {
  console.log("=== Day1Global 每日早报生成 ===");
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`Dashboard: ${BASE_URL}`);
  if (skipTelegram) console.log("⚠ 跳过 Telegram 推送 (--skip-telegram)");
  if (telegramAudioOnly) console.log("⚠ 只推送音频 (--telegram-audio-only)");
  if (telegramTextOnly) console.log("⚠ 只推送文字 (--telegram-text-only)");
  console.log("");

  // 检查必需的环境变量
  const required = ["ANTHROPIC_API_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ 缺少必需环境变量: ${key}`);
      process.exit(1);
    }
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

  // ---- 第一步：获取市场数据 ----
  console.log("[1/7] 获取市场数据...");
  const dataRes = await fetch(`${BASE_URL}/api/market-data`);
  if (!dataRes.ok) {
    throw new Error(`获取市场数据失败: ${dataRes.status}`);
  }
  const data: MarketDataResponse = await dataRes.json();
  console.log(`  ✓ 数据时间: ${data.timestamp}`);
  console.log(`  BTC: $${data.crypto?.BTC?.price?.toFixed(0) || "N/A"}`);

  // ---- 第二步：BTC 指标存入 Postgres ----
  console.log("[2/7] 存储 BTC 指标到 Postgres...");
  try {
    await ensureTable();
    await migrateAddColumns();
    const today = getTodayBeijing();
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
      nupl: data.btcMetrics?.nupl ?? null,
      lthMvrv: data.btcMetrics?.lthMvrv ?? null,
      ma365Price: data.btcMetrics?.ma365Price ?? null,
      ma365Ratio: data.btcMetrics?.ma365Ratio ?? null,
      etfFlowUsd: data.btcMetrics?.etfFlowUsd ?? null,
      fundingRate: data.btcMetrics?.fundingRate ?? null,
      longShortRatio: data.btcMetrics?.longShortRatio ?? null,
    });
    console.log(`  ✓ 已写入 (${today})`);
  } catch (dbErr) {
    console.error("  ✗ Postgres 写入失败:", dbErr);
  }

  // ---- 第三步：获取新闻 ----
  console.log("[3/7] 获取新闻...");
  const [rawNews, geoNews] = await Promise.all([
    fetchNews(),
    fetchGeopoliticalNews(),
  ]);
  console.log(`  ✓ 常规新闻 ${rawNews.length} 条`);
  console.log(`  ✓ 地缘新闻: 停火 ${geoNews.iranCeasefire.length} 条, 海峡 ${geoNews.hormuzStrait.length} 条`);

  // ---- 第四步：Claude AI 生成分析 ----
  console.log("[4/7] 调用 Claude AI 生成分析...");
  const analysis = await generateMarketAnalysis(data, rawNews, geoNews);
  console.log(`  ✓ 分析已生成: ${analysis.generatedAt}`);
  console.log(`  精选新闻 ${analysis.topNews.length} 条`);

  // ---- 第五步：存入 Redis ----
  console.log("[5/7] 存入 Redis...");
  await redis.set("ai-analysis", analysis, { ex: 86400 });
  console.log("  ✓ AI 分析已缓存 (24h TTL)");

  // ---- 第六步：生成 TTS 音频 + 上传 Blob ----
  let audioBuffer: Buffer | null = null;
  if (process.env.OPENAI_API_KEY) {
    console.log("[6/7] 生成 TTS 音频...");
    try {
      audioBuffer = await generateTTSAudio(data, analysis);
      const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
      console.log(`  ✓ 音频大小: ${sizeMB} MB`);

      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const today = getTodayBeijing();
        const blob = await put(`briefing-audio/${today}.mp3`, audioBuffer, {
          access: "public",
          contentType: "audio/mpeg",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        await redis.set("briefing-audio-url", blob.url, { ex: 86400 });
        console.log(`  ✓ Blob URL: ${blob.url}`);
      }
    } catch (ttsErr) {
      console.error("  ✗ 音频生成失败:", ttsErr);
      audioBuffer = null;
    }
  } else {
    console.log("[6/7] 未设置 OPENAI_API_KEY，跳过音频生成");
  }

  // ---- 第七步：推送 Telegram（音频在前，文字在后） ----
  if (!skipTelegram && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    console.log("[7/7] 推送到 Telegram...");

    // 先推音频
    if (!telegramTextOnly) {
      if (audioBuffer) {
        const audioPushed = await pushTelegramAudio(audioBuffer);
        console.log(audioPushed ? "  ✓ 音频推送成功" : "  ✗ 音频推送失败");
      } else {
        console.log("  - 无音频，跳过音频推送");
      }
    } else {
      console.log("  - 只推文字模式，跳过音频推送");
    }

    // 再推文字
    if (!telegramAudioOnly) {
      const textPushed = await pushTelegramBriefing(data, analysis);
      console.log(textPushed ? "  ✓ 文字推送成功" : "  ✗ 文字推送失败");
    } else {
      console.log("  - 只推音频模式，跳过文字推送");
    }
  } else if (skipTelegram) {
    console.log("[7/7] 跳过 Telegram 推送");
  } else {
    console.log("[7/7] 未设置 Telegram 环境变量，跳过");
  }

  console.log("\n=== 完成 ===");
}

main().catch((err) => {
  console.error("\n❌ 流程失败:", err);
  process.exit(1);
});
