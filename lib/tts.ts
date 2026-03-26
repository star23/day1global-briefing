// ========== TTS 语音合成 ==========
// 使用 OpenAI TTS API 将早报文本转为音频
// 需要环境变量: OPENAI_API_KEY

import OpenAI from "openai";
import { MarketDataResponse, AIAnalysis } from "./types";

const MAX_CHUNK_LENGTH = 4000; // OpenAI TTS limit is 4096 chars, leave buffer

/** 将早报内容格式化为适合朗读的纯文本 */
export function formatBriefingForTTS(
  data: MarketDataResponse,
  analysis: AIAnalysis
): string {
  const lines: string[] = [];

  const now = new Date();
  const dateStr = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  });

  lines.push(`Day1Global 美股加密市场早报。${dateStr}。`);
  lines.push("");

  // 市场全景
  lines.push("市场全景。");
  if (data.stocks.VOO) {
    lines.push(
      `标普500 ETF VOO: ${data.stocks.VOO.price.toFixed(2)}美元，${fmtSpoken(data.stocks.VOO.changePercent)}。`
    );
  }
  if (data.stocks.QQQM) {
    lines.push(
      `纳指100 ETF QQQM: ${data.stocks.QQQM.price.toFixed(2)}美元，${fmtSpoken(data.stocks.QQQM.changePercent)}。`
    );
  }
  if (data.indices.vix?.price) {
    lines.push(
      `VIX恐慌指数: ${data.indices.vix.price.toFixed(1)}，${fmtSpoken(data.indices.vix.changePercent)}。`
    );
  }
  if (data.indices.gold?.price) {
    lines.push(
      `黄金: ${data.indices.gold.price.toFixed(2)}美元，${fmtSpoken(data.indices.gold.changePercent)}。`
    );
  }
  if (data.indices.dxy?.price) {
    lines.push(
      `美元指数: ${data.indices.dxy.price.toFixed(2)}，${fmtSpoken(data.indices.dxy.changePercent)}。`
    );
  }
  if (data.crypto.BTC) {
    lines.push(
      `比特币: ${data.crypto.BTC.price.toFixed(0)}美元，${fmtSpoken(data.crypto.BTC.change24h)}。`
    );
  }
  if (data.crypto.ETH) {
    lines.push(
      `以太坊: ${data.crypto.ETH.price.toFixed(0)}美元，${fmtSpoken(data.crypto.ETH.change24h)}。`
    );
  }
  lines.push("");

  // 市场情绪
  lines.push("市场情绪。");
  lines.push(
    `加密恐惧贪婪指数: ${data.sentiment.cryptoFearGreed}分，${data.sentiment.cryptoFearGreedLabel}。`
  );
  if (data.sentiment.cnnFearGreed !== null) {
    lines.push(
      `CNN恐惧贪婪指数: ${data.sentiment.cnnFearGreed}分，${data.sentiment.cnnFearGreedLabel}。`
    );
  }
  lines.push("");

  // AI 分析
  lines.push("AI宏观判断。");
  lines.push(stripHtml(analysis.macroAnalysis));
  lines.push("");

  lines.push("AI加密分析。");
  lines.push(stripHtml(analysis.cryptoAnalysis));
  lines.push("");

  lines.push("操作建议。");
  lines.push(stripHtml(analysis.actionSuggestions));
  lines.push("");

  // 地缘政治
  if (analysis.iranCeasefire) {
    lines.push("伊朗停火进展。");
    lines.push(stripHtml(analysis.iranCeasefire));
    lines.push("");
  }
  if (analysis.hormuzStrait) {
    lines.push("霍尔木兹海峡局势。");
    lines.push(stripHtml(analysis.hormuzStrait));
    lines.push("");
  }

  // 标的动态
  if (analysis.cryptoTopicsAnalysis) {
    lines.push("加密标的动态。");
    lines.push(stripHtml(analysis.cryptoTopicsAnalysis));
    lines.push("");
  }
  if (analysis.stockTopicsAnalysis) {
    lines.push("美股标的动态。");
    lines.push(stripHtml(analysis.stockTopicsAnalysis));
    lines.push("");
  }

  // 新闻
  if (analysis.topNews && analysis.topNews.length > 0) {
    lines.push("今日必看新闻。");
    analysis.topNews.slice(0, 5).forEach((n, i) => {
      lines.push(`第${i + 1}条，${n.tag}：${n.title}。${n.summary}`);
    });
    lines.push("");
  }

  lines.push("以上是今天的早报，完整数据请访问 brief.day1global.xyz。");

  return lines.join("\n");
}

/** 涨跌幅口语化 */
function fmtSpoken(change: number): string {
  if (change > 0) return `上涨${change.toFixed(2)}%`;
  if (change < 0) return `下跌${Math.abs(change).toFixed(2)}%`;
  return "持平";
}

/** 移除 HTML 标签和多余符号 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/📈|📉|🟢|🔴|🟡|⚪|📡|📅|🌍|🎯|🧠|₿|💼|⛽|📊|🪙|📰|🔗|🚨|⚠️|🥇|👉/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 将长文本拆分为不超过限制的段落 */
function splitTextForTTS(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split("\n\n");
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current.trim());
      // If a single paragraph exceeds limit, split by sentences
      if (para.length > MAX_CHUNK_LENGTH) {
        const sentences = para.split(/(?<=[。！？；\n])/);
        let sentChunk = "";
        for (const sent of sentences) {
          if (sentChunk.length + sent.length > MAX_CHUNK_LENGTH) {
            if (sentChunk) chunks.push(sentChunk.trim());
            sentChunk = sent;
          } else {
            sentChunk += sent;
          }
        }
        current = sentChunk;
      } else {
        current = para;
      }
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current) chunks.push(current.trim());

  return chunks;
}

/** 生成 TTS 音频 (返回 MP3 Buffer) */
export async function generateTTSAudio(
  data: MarketDataResponse,
  analysis: AIAnalysis
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未设置");
  }

  const openai = new OpenAI({ apiKey });
  const text = formatBriefingForTTS(data, analysis);
  const chunks = splitTextForTTS(text);

  console.log(
    `[TTS] 文本共 ${text.length} 字符，拆分为 ${chunks.length} 段`
  );

  const audioBuffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `[TTS] 正在生成第 ${i + 1}/${chunks.length} 段 (${chunks[i].length} 字符)...`
    );

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: chunks[i],
      response_format: "mp3",
      speed: 1.1,
    });

    const arrayBuffer = await response.arrayBuffer();
    audioBuffers.push(Buffer.from(arrayBuffer));
  }

  // Concatenate MP3 buffers (MP3 frames are independently decodable)
  const combined = Buffer.concat(audioBuffers);
  console.log(
    `[TTS] 音频生成完成，总大小 ${(combined.length / 1024 / 1024).toFixed(2)} MB`
  );

  return combined;
}
