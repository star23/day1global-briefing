// ========== AI 市场分析生成器 ==========
// 调用 Claude API 根据实时市场数据 + 新闻生成中文分析报告
// 生成内容：宏观判断、加密分析、操作建议、今日必看 10 条新闻

import Anthropic from "@anthropic-ai/sdk";
import { MarketDataResponse, AIAnalysis, NewsItem } from "./types";
import { RawNewsItem } from "./fetch-news";
import { GeopoliticalNews, formatGeopoliticalNewsForPrompt } from "./fetch-geopolitical-news";

// 创建 Anthropic 客户端（使用环境变量 ANTHROPIC_API_KEY）
const anthropic = new Anthropic();

/** 将市场数据格式化为 Claude 能理解的文本摘要 */
function formatMarketDataForPrompt(data: MarketDataResponse): string {
  // 美股部分
  const stockLines = Object.entries(data.stocks)
    .map(([ticker, s]) => `  ${ticker}: $${s.price.toFixed(2)} (${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%) [${s.marketState}]`)
    .join("\n");

  // 加密货币部分
  const cryptoLines = Object.entries(data.crypto)
    .map(([ticker, c]) => `  ${ticker}: $${c.price.toFixed(2)} (24h: ${c.change24h >= 0 ? "+" : ""}${c.change24h.toFixed(2)}%)`)
    .join("\n");

  // 组装完整的数据摘要
  return `
数据时间: ${data.timestamp}

【美股持仓】
${stockLines || "  暂无数据"}

【加密货币】
${cryptoLines || "  暂无数据"}

【指数与商品】
  VIX 恐慌指数: ${data.indices.vix.price.toFixed(2)} (${data.indices.vix.changePercent >= 0 ? "+" : ""}${data.indices.vix.changePercent.toFixed(2)}%)
  黄金 (GC=F): $${data.indices.gold.price.toFixed(2)} (${data.indices.gold.changePercent >= 0 ? "+" : ""}${data.indices.gold.changePercent.toFixed(2)}%)
  原油 (CL=F): $${data.indices.crudeOil.price.toFixed(2)} (${data.indices.crudeOil.changePercent >= 0 ? "+" : ""}${data.indices.crudeOil.changePercent.toFixed(2)}%)

【市场情绪】
  加密恐慌贪婪指数: ${data.sentiment.cryptoFearGreed}/100 (${data.sentiment.cryptoFearGreedLabel})${data.sentiment.cryptoFearGreedPrev !== null ? ` [昨日: ${data.sentiment.cryptoFearGreedPrev}, 变化: ${data.sentiment.cryptoFearGreedChange !== null && data.sentiment.cryptoFearGreedChange > 0 ? "+" : ""}${data.sentiment.cryptoFearGreedChange}]` : ""}${data.sentiment.cnnFearGreed !== null ? `\n  CNN恐惧贪婪指数(美股): ${data.sentiment.cnnFearGreed}/100 (${data.sentiment.cnnFearGreedLabel})` : ""}${data.btcMetrics?.weeklyRsi !== null ? `\n\n【BTC技术指标】\n  周线RSI: ${data.btcMetrics.weeklyRsi}` : ""}${data.btcMetrics?.volume24h !== null ? `\n  24h成交量: $${(data.btcMetrics.volume24h! / 1e9).toFixed(1)}B (${data.btcMetrics.volumeChangePercent !== null ? `${data.btcMetrics.volumeChangePercent > 0 ? "+" : ""}${data.btcMetrics.volumeChangePercent.toFixed(0)}% vs 30日均值` : "N/A"})` : ""}${data.btcMetrics?.sthSopr !== null ? `\n  STH-SOPR(短期持有者利润率): ${data.btcMetrics.sthSopr}` : ""}${data.btcMetrics?.lthSopr !== null ? `\n  LTH-SOPR(长期持有者利润率): ${data.btcMetrics.lthSopr}` : ""}${data.btcMetrics?.wma200Price !== null ? `\n  200周均线: $${data.btcMetrics.wma200Price!.toLocaleString()}${data.btcMetrics.wma200Multiplier !== null ? ` (当前价格/200WMA = ${data.btcMetrics.wma200Multiplier}x)` : ""}` : ""}
`.trim();
}

/** 将原始新闻格式化为 Claude 能理解的文本列表 */
function formatNewsForPrompt(news: RawNewsItem[]): string {
  if (news.length === 0) return "";

  const lines = news.map((n, i) => {
    const date = new Date(n.datetime * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `[${i + 1}] ${n.headline}\n    来源: ${n.source} | 时间: ${date}\n    摘要: ${n.summary?.slice(0, 150) || "无"}\n    链接: ${n.url}`;
  });

  return `\n\n【今日新闻（共${news.length}条，请精选10条最重要的）】\n${lines.join("\n\n")}`;
}

/** 调用 Claude API 生成市场分析 */
export async function generateMarketAnalysis(
  data: MarketDataResponse,
  rawNews: RawNewsItem[] = [],
  geoNews: GeopoliticalNews = { iranCeasefire: [], hormuzStrait: [] }
): Promise<AIAnalysis> {
  const marketSummary = formatMarketDataForPrompt(data);
  const newsSummary = formatNewsForPrompt(rawNews);
  const geoNewsSummary = formatGeopoliticalNewsForPrompt(geoNews);

  // 构建 Prompt
  const prompt = `你是一位专业的全球市场分析师，为中文投资者提供每日投资情报早报。

以下是今日最新的市场数据：

${marketSummary}${newsSummary}${geoNewsSummary}

请根据以上数据和新闻，生成今日市场分析报告。报告必须使用以下格式，每个部分用分隔符标记：

===宏观判断===
（分析全球宏观环境：美股大盘走势、VIX波动率水平含义、黄金与原油价格趋势、美元/利率环境对市场的影响。2-4段，每段2-3句话。重点关注数据背后的逻辑和市场信号。）

===加密分析===
（分析加密货币市场：BTC价格走势和关键位、ETH及其他代币表现、恐慌贪婪指数解读、加密市场与传统市场的联动性。2-4段，每段2-3句话。）

===操作建议===
（基于以上分析给出具体的操作思路：仓位管理建议、需要关注的风险点、潜在机会。使用要点列表格式，3-5条。注意：必须声明不构成投资建议。）

===伊朗停火===
（基于主题A的新闻和推文，分析美国与伊朗战争/冲突的最新停火进展。包括：双方的最新表态和行动、停火谈判进展、国际社会的调停努力、对全球市场（尤其是原油和避险资产）的潜在影响。2-3段，每段2-3句话。如果没有相关新闻，请说明目前暂无最新进展。）

===霍尔木兹海峡===
（基于主题B的新闻和推文，分析伊朗是否会封锁霍尔木兹海峡。包括：伊朗的最新军事动态和官方声明、海峡通航的实际状况、对全球原油供应和油价的影响评估、各方的应对措施。2-3段，每段2-3句话。如果没有相关新闻，请说明目前暂无最新进展。）

===今日必看===
从以上新闻中精选10条对投资者最重要的新闻（如果新闻不足10条则有多少选多少），输出一个合法的JSON数组。每条包含：
- title: 中文标题（简洁概括，15字以内）
- tag: 分类标签（宏观/加密/财报/政策/避险/科技/地缘 等，2-3字）
- summary: 一句话中文说明（为什么重要）
- action: 对投资者的操作建议（一句话）
- source: 原文来源名称
- url: 原文链接（必须使用新闻中提供的原始URL，不要修改）

格式示例：
[{"title":"美联储暗示暂停加息","tag":"宏观","summary":"鲍威尔讲话释放鸽派信号，市场预期降息概率上升","action":"利好美股和加密，关注成长股反弹机会","source":"Reuters","url":"https://..."}]

要求：
- 全部使用中文（新闻标题和摘要翻译成中文）
- 分析要基于实际数据，不要泛泛而谈
- 语气专业但通俗易懂（读者可能是非专业投资者）
- 宏观判断、加密分析、操作建议每个部分控制在 200 字以内
- 伊朗停火、霍尔木兹海峡每个部分控制在 300 字以内
- 今日必看的JSON必须是合法的JSON数组，可以直接被 JSON.parse 解析`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  // 提取文本响应
  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // 解析文本部分（通过分隔符切割）
  const macroAnalysis = extractSection(responseText, "宏观判断");
  const cryptoAnalysis = extractSection(responseText, "加密分析");
  const actionSuggestions = extractSection(responseText, "操作建议");
  const iranCeasefire = extractSection(responseText, "伊朗停火");
  const hormuzStrait = extractSection(responseText, "霍尔木兹海峡");

  // 解析新闻 JSON
  const topNews = extractNewsJSON(responseText);

  return {
    macroAnalysis,
    cryptoAnalysis,
    actionSuggestions,
    topNews,
    iranCeasefire,
    hormuzStrait,
    generatedAt: new Date().toISOString(),
    dataTimestamp: data.timestamp,
  };
}

/** 从 AI 响应中提取指定部分的内容 */
function extractSection(text: string, sectionName: string): string {
  // 匹配 ===宏观判断=== 到下一个 === 或文末
  // 不要加 "m" 标志！m 让 $ 匹配每行末尾，导致 lazy [\s\S]*? 只捕获第一行
  const regex = new RegExp(
    `===${sectionName}===\\s*([\\s\\S]*?)(?====.+===|$)`
  );
  const match = text.match(regex);
  return match ? match[1].trim() : `${sectionName}分析暂未生成`;
}

/** 清理 AI 生成的 JSON 字符串中的常见问题 */
function sanitizeJsonString(raw: string): string {
  // 1. 移除 JSON 前后可能存在的 markdown 代码块标记
  let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // 2. 修复字符串值内部的未转义换行符（不影响 JSON 结构性换行）
  //    遍历找到所有 "..." 字符串，替换其中的真实换行为 \\n
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  });

  // 3. 移除尾部多余逗号（如 ,] 或 ,}）
  s = s.replace(/,\s*([\]}])/g, "$1");

  return s;
}

/** 从 AI 响应中提取今日必看新闻 JSON */
function extractNewsJSON(text: string): NewsItem[] {
  try {
    // 先提取 ===今日必看=== 部分的内容
    const section = extractSection(text, "今日必看");

    // 尝试从中找到 JSON 数组
    const jsonMatch = section.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[News] 未找到新闻 JSON 数组");
      return [];
    }

    // 清理 JSON 字符串
    const cleanJson = sanitizeJsonString(jsonMatch[0]);

    let parsed: unknown[];
    try {
      parsed = JSON.parse(cleanJson);
    } catch (firstErr) {
      // 第二次尝试：逐个提取 JSON 对象
      console.warn("[News] JSON 整体解析失败，尝试逐条提取:", (firstErr as Error).message);
      const objMatches = cleanJson.match(/\{[^{}]*\}/g);
      if (!objMatches || objMatches.length === 0) {
        console.error("[News] 逐条提取也未找到新闻对象");
        return [];
      }
      parsed = [];
      for (const objStr of objMatches) {
        try {
          parsed.push(JSON.parse(objStr));
        } catch {
          // 跳过解析失败的单条
        }
      }
      if (parsed.length === 0) {
        console.error("[News] 所有单条新闻解析均失败");
        return [];
      }
      console.log(`[News] 逐条提取成功恢复 ${parsed.length} 条新闻`);
    }

    if (!Array.isArray(parsed)) {
      console.error("[News] 解析结果不是数组");
      return [];
    }

    // 验证并清洗每条新闻
    return parsed
      .filter(
        (item: unknown) => {
          const n = item as NewsItem;
          return n.title && n.source;
        }
      )
      .slice(0, 10)
      .map((item: unknown) => {
        const n = item as NewsItem;
        return {
          title: String(n.title),
          tag: String(n.tag || "资讯"),
          summary: String(n.summary || ""),
          action: String(n.action || ""),
          source: String(n.source),
          url: String(n.url || ""),
        };
      });
  } catch (err) {
    console.error("[News] 解析新闻 JSON 失败:", err);
    return [];
  }
}
