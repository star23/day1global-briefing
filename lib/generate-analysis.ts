// ========== AI 市场分析生成器 ==========
// 调用 Claude API 根据实时市场数据生成中文分析报告
// 生成三部分内容：宏观判断、加密分析、操作建议

import Anthropic from "@anthropic-ai/sdk";
import { MarketDataResponse, AIAnalysis } from "./types";

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

【市场情绪】
  加密恐慌贪婪指数: ${data.sentiment.cryptoFearGreed}/100 (${data.sentiment.cryptoFearGreedLabel})
`.trim();
}

/** 调用 Claude API 生成市场分析 */
export async function generateMarketAnalysis(data: MarketDataResponse): Promise<AIAnalysis> {
  const marketSummary = formatMarketDataForPrompt(data);

  // 构建 Prompt：要求 Claude 生成三段中文分析
  const prompt = `你是一位专业的全球市场分析师，为中文投资者提供每日投资情报早报。

以下是今日最新的市场数据：

${marketSummary}

请根据以上数据，生成今日市场分析报告。报告必须使用以下格式，每个部分用分隔符标记：

===宏观判断===
（分析全球宏观环境：美股大盘走势、VIX波动率水平含义、黄金价格趋势、美元/利率环境对市场的影响。2-4段，每段2-3句话。重点关注数据背后的逻辑和市场信号。）

===加密分析===
（分析加密货币市场：BTC价格走势和关键位、ETH及其他代币表现、恐慌贪婪指数解读、加密市场与传统市场的联动性。2-4段，每段2-3句话。）

===操作建议===
（基于以上分析给出具体的操作思路：仓位管理建议、需要关注的风险点、潜在机会。使用要点列表格式，3-5条。注意：必须声明不构成投资建议。）

要求：
- 全部使用中文
- 分析要基于实际数据，不要泛泛而谈
- 语气专业但通俗易懂（读者可能是非专业投资者）
- 每个部分控制在 200 字以内`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  // 提取文本响应
  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // 解析三个部分（通过分隔符切割）
  const macroAnalysis = extractSection(responseText, "宏观判断");
  const cryptoAnalysis = extractSection(responseText, "加密分析");
  const actionSuggestions = extractSection(responseText, "操作建议");

  return {
    macroAnalysis,
    cryptoAnalysis,
    actionSuggestions,
    generatedAt: new Date().toISOString(),
    dataTimestamp: data.timestamp,
  };
}

/** 从 AI 响应中提取指定部分的内容 */
function extractSection(text: string, sectionName: string): string {
  // 匹配 ===宏观判断=== 到下一个 === 或文末
  const regex = new RegExp(
    `===${sectionName}===\\s*([\\s\\S]*?)(?====.+===|$)`,
    "m"
  );
  const match = text.match(regex);
  return match ? match[1].trim() : `${sectionName}分析暂未生成`;
}
