// ========== Telegram 消息推送 ==========
// 通过 Telegram Bot API 将每日早报推送到指定群组/频道
// 需要环境变量: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { MarketDataResponse, AIAnalysis } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

/** 发送 Telegram 消息（支持 HTML 格式） */
async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("[Telegram] 未设置 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID，跳过推送");
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[Telegram] 发送失败:", err);
      return false;
    }

    console.log("[Telegram] 消息推送成功");
    return true;
  } catch (err) {
    console.error("[Telegram] 推送出错:", err);
    return false;
  }
}

/** 格式化价格 */
function fmtPrice(price: number, isCrypto = false): string {
  if (isCrypto) {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 格式化涨跌幅（带箭头） */
function fmtChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  const arrow = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";
  return `${arrow} ${sign}${change.toFixed(2)}%`;
}

/** 将市场数据 + AI 分析格式化为 Telegram 消息 */
export function formatTelegramMessage(data: MarketDataResponse, analysis: AIAnalysis): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  });

  const lines: string[] = [];

  // ---- 标题 ----
  lines.push(`📡 <b>美股&加密市场早报</b>`);
  lines.push(`📅 ${dateStr}\n`);

  // ---- 市场全景 ----
  lines.push(`🌍 <b>市场全景</b>`);

  // 美股 ETF
  if (data.stocks.VOO) {
    lines.push(`  VOO (S&P500): $${fmtPrice(data.stocks.VOO.price)} ${fmtChange(data.stocks.VOO.changePercent)}`);
  }
  if (data.stocks.QQQM) {
    lines.push(`  QQQM (Nasdaq): $${fmtPrice(data.stocks.QQQM.price)} ${fmtChange(data.stocks.QQQM.changePercent)}`);
  }

  // 指数
  if (data.indices.vix.price) {
    lines.push(`  VIX: ${fmtPrice(data.indices.vix.price)} ${fmtChange(data.indices.vix.changePercent)}`);
  }
  if (data.indices.gold.price) {
    lines.push(`  Gold: $${fmtPrice(data.indices.gold.price)} ${fmtChange(data.indices.gold.changePercent)}`);
  }
  if (data.indices.crudeOil?.price) {
    lines.push(`  Crude Oil: $${fmtPrice(data.indices.crudeOil.price)} ${fmtChange(data.indices.crudeOil.changePercent)}`);
  }
  if (data.indices.dxy?.price) {
    lines.push(`  DXY: ${fmtPrice(data.indices.dxy.price)} ${fmtChange(data.indices.dxy.changePercent)}`);
  }

  // 加密
  if (data.crypto.BTC) {
    lines.push(`  BTC: $${fmtPrice(data.crypto.BTC.price, true)} ${fmtChange(data.crypto.BTC.change24h)}`);
  }
  if (data.crypto.ETH) {
    lines.push(`  ETH: $${fmtPrice(data.crypto.ETH.price, true)} ${fmtChange(data.crypto.ETH.change24h)}`);
  }

  // 情绪指标
  lines.push("");
  lines.push(`🎯 <b>市场情绪</b>`);
  lines.push(`  加密恐慌贪婪: ${data.sentiment.cryptoFearGreed}/100 (${data.sentiment.cryptoFearGreedLabel})${data.sentiment.cryptoFearGreedChange !== null ? ` [${data.sentiment.cryptoFearGreedChange > 0 ? "+" : ""}${data.sentiment.cryptoFearGreedChange}, 昨日${data.sentiment.cryptoFearGreedPrev}]` : ""}`);
  if (data.sentiment.cnnFearGreed !== null) {
    lines.push(`  CNN恐惧贪婪: ${data.sentiment.cnnFearGreed}/100 (${data.sentiment.cnnFearGreedLabel})`);
  }

  // BTC 技术指标
  if (data.btcMetrics?.weeklyRsi !== null) {
    lines.push(`  BTC周线RSI: ${data.btcMetrics.weeklyRsi}`);
  }

  // ---- AI 分析 ----
  lines.push("");
  lines.push(`🧠 <b>AI 宏观判断</b>`);
  lines.push(analysis.macroAnalysis);

  lines.push("");
  lines.push(`₿ <b>AI 加密分析</b>`);
  lines.push(analysis.cryptoAnalysis);

  lines.push("");
  lines.push(`💼 <b>操作建议</b>`);
  lines.push(analysis.actionSuggestions);

  // ---- 地缘政治专题 ----
  if (analysis.iranCeasefire) {
    lines.push("");
    lines.push(`🌍 <b>伊朗停火进展</b>`);
    lines.push(analysis.iranCeasefire);
  }
  if (analysis.hormuzStrait) {
    lines.push("");
    lines.push(`⛽ <b>霍尔木兹海峡</b>`);
    lines.push(analysis.hormuzStrait);
  }
  if (analysis.cryptoTopicsAnalysis) {
    lines.push("");
    lines.push(`🪙 <b>加密标的动态</b>`);
    lines.push(analysis.cryptoTopicsAnalysis);
  }
  if (analysis.stockTopicsAnalysis) {
    lines.push("");
    lines.push(`📊 <b>美股标的动态</b>`);
    lines.push(analysis.stockTopicsAnalysis);
  }

  // ---- 持仓快览 ----
  const stockTickers = Object.keys(data.stocks);
  if (stockTickers.length > 0) {
    lines.push("");
    lines.push(`📈 <b>美股持仓</b>`);
    for (const [ticker, stock] of Object.entries(data.stocks)) {
      const arrow = stock.changePercent > 0 ? "🟢" : stock.changePercent < 0 ? "🔴" : "⚪";
      lines.push(`  ${arrow} ${ticker}: $${fmtPrice(stock.price)} (${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}%)`);
    }
  }

  const cryptoTickers = Object.keys(data.crypto);
  if (cryptoTickers.length > 0) {
    lines.push("");
    lines.push(`₿ <b>加密持仓</b>`);
    for (const [ticker, coin] of Object.entries(data.crypto)) {
      const arrow = coin.change24h > 0 ? "🟢" : coin.change24h < 0 ? "🔴" : "⚪";
      lines.push(`  ${arrow} ${ticker}: $${fmtPrice(coin.price, true)} (${coin.change24h >= 0 ? "+" : ""}${coin.change24h.toFixed(2)}%)`);
    }
  }

  // ---- 今日必看新闻 ----
  if (analysis.topNews && analysis.topNews.length > 0) {
    lines.push("");
    lines.push(`📰 <b>今日必看新闻</b>`);
    // Telegram 消息字数有限，取前 5 条
    const topItems = analysis.topNews.slice(0, 5);
    topItems.forEach((n, i) => {
      lines.push(`${i + 1}. [${n.tag}] <a href="${n.url}">${n.title}</a>`);
      if (n.action) lines.push(`   👉 ${n.action}`);
    });
    if (analysis.topNews.length > 5) {
      lines.push(`  ...更多新闻请访问网站`);
    }
  }

  // ---- 尾部 ----
  lines.push("");
  lines.push(`📊 完整数据请访问 <a href="https://brief.day1global.xyz/">brief.day1global.xyz</a>`);
  lines.push(`🔗 <a href="https://day1global.xyz/">Day1Global</a> | <a href="https://x.com/starzq">X</a> | <a href="https://t.me/day1global">Telegram</a> | <a href="https://www.youtube.com/@Day1Global">YouTube</a>`);

  return lines.join("\n");
}

/** 按 section 标记拆分消息为多段，每段不超过 4096 字符 */
function splitMessage(message: string): string[] {
  if (message.length <= 4096) return [message];

  // 按已知的 section emoji 标记拆分
  const sectionMarkers = [
    "🧠 <b>AI 宏观判断</b>",
    "₿ <b>AI 加密分析</b>",
    "💼 <b>操作建议</b>",
    "🌍 <b>伊朗停火进展</b>",
    "⛽ <b>霍尔木兹海峡</b>",
    "🪙 <b>加密标的动态</b>",
    "📊 <b>美股标的动态</b>",
    "📈 <b>美股持仓</b>",
    "₿ <b>加密持仓</b>",
    "📰 <b>今日必看新闻</b>",
    "📊 完整数据请访问",
  ];

  // 找到所有 section 的起始位置
  const breakpoints: number[] = [0];
  for (const marker of sectionMarkers) {
    const idx = message.indexOf(marker);
    if (idx > 0) breakpoints.push(idx);
  }
  breakpoints.sort((a, b) => a - b);

  // 贪心合并 sections，使每段不超过 4096
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < breakpoints.length; i++) {
    const start = breakpoints[i];
    const end = i + 1 < breakpoints.length ? breakpoints[i + 1] : message.length;
    const segment = message.substring(start, end);

    if (current.length + segment.length > 4096) {
      if (current) parts.push(current.trim());
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) parts.push(current.trim());

  // 安全检查：如果某段仍超 4096，强制截断
  return parts.map((p) => (p.length > 4096 ? p.substring(0, 4090) + "\n..." : p));
}

/** 推送每日早报到 Telegram */
export async function pushTelegramBriefing(data: MarketDataResponse, analysis: AIAnalysis): Promise<boolean> {
  const message = formatTelegramMessage(data, analysis);
  const parts = splitMessage(message);

  console.log(`[Telegram] 消息总长 ${message.length} 字符，拆分为 ${parts.length} 段`);

  let allOk = true;
  for (const part of parts) {
    const ok = await sendTelegramMessage(part);
    if (!ok) allOk = false;
  }
  return allOk;
}
