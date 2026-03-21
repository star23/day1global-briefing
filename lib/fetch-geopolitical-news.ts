// ========== 获取专题新闻 ==========
// 从 6551.io API (opennews + opentwitter) 获取特定主题的新闻和推文
// 需要环境变量: NEWS_6551_TOKEN

const API_BASE = "https://ai.6551.io";

export interface GeoNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

/** 搜索 opennews 新闻 */
async function searchNews(
  token: string,
  query: string,
  limit: number = 10
): Promise<GeoNewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/open/news_search`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, limit }),
    });
    if (!res.ok) {
      console.error(`[6551 News] 搜索失败 [${query}]: ${res.status}`);
      return [];
    }
    const json = await res.json();
    const items = json.data ?? [];
    return items.map((item: Record<string, unknown>) => ({
      title: String(item.title || item.text || ""),
      summary: String(item.summary || item.text || "").slice(0, 300),
      source: String(item.sourceName || item.source || "OpenNews"),
      url: String(item.link || item.url || ""),
      publishedAt: String(item.publishedAt || item.createdAt || ""),
    }));
  } catch (err) {
    console.error(`[6551 News] 搜索出错 [${query}]:`, err);
    return [];
  }
}

/** 搜索 opentwitter 推文 */
async function searchTwitter(
  token: string,
  keywords: string,
  limit: number = 10
): Promise<GeoNewsItem[]> {
  try {
    const res = await fetch(`${API_BASE}/open/twitter_search`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keywords, maxResults: limit, product: "Top" }),
    });
    if (!res.ok) {
      console.error(`[6551 Twitter] 搜索失败 [${keywords}]: ${res.status}`);
      return [];
    }
    const json = await res.json();
    const items = json.data ?? [];
    return items.map((item: Record<string, unknown>) => {
      const user = (item.user as Record<string, unknown>) || {};
      const username = String(user.username || user.screenName || "");
      return {
        title: String(item.text || "").slice(0, 200),
        summary: String(item.text || "").slice(0, 300),
        source: username ? `@${username}` : "Twitter",
        url: username && item.id
          ? `https://x.com/${username}/status/${item.id}`
          : "",
        publishedAt: String(item.createdAt || ""),
      };
    });
  } catch (err) {
    console.error(`[6551 Twitter] 搜索出错 [${keywords}]:`, err);
    return [];
  }
}

// ========== 搜索主题配置 ==========

/** 地缘政治主题（新闻 + 中文 + 推文） */
const GEO_TOPICS = [
  { key: "iranCeasefire", label: "美国-伊朗停火/战争进展", newsEn: "Iran ceasefire war", newsCn: "伊朗 停火", tweets: "Iran ceasefire war deal" },
  { key: "hormuzStrait", label: "伊朗与霍尔木兹海峡", newsEn: "Hormuz strait blockade Iran", newsCn: "霍尔木兹海峡 封锁", tweets: "Strait of Hormuz Iran blockade" },
] as const;

/** 加密标的主题（每个标的 1 条新闻搜索） */
const CRYPTO_TOPICS = [
  { key: "BTC", label: "Bitcoin (BTC)", query: "Bitcoin BTC ETF" },
  { key: "ETH", label: "Ethereum (ETH)", query: "Ethereum ETH upgrade DeFi" },
  { key: "XAUT", label: "Tether Gold (XAUT)", query: "Tether Gold XAUT" },
  { key: "HYPE", label: "Hyperliquid (HYPE)", query: "Hyperliquid HYPE" },
  { key: "VIRTUAL", label: "Virtuals Protocol (VIRTUAL)", query: "Virtuals Protocol VIRTUAL AI agent" },
  { key: "TAO", label: "Bittensor (TAO)", query: "Bittensor TAO subnet" },
  { key: "BNB", label: "BNB Chain", query: "BNB Binance Chain" },
  { key: "SOL", label: "Solana (SOL)", query: "Solana SOL ecosystem" },
] as const;

/** 美股标的主题（每个标的 1 条新闻搜索） */
const STOCK_TOPICS = [
  { key: "NVDA", label: "英伟达 (NVDA)", query: "Nvidia NVDA AI GPU" },
  { key: "TSLA", label: "特斯拉 (TSLA)", query: "Tesla TSLA" },
  { key: "GOOG", label: "Google (GOOG)", query: "Google Alphabet GOOG AI" },
  { key: "RKLB", label: "Rocket Lab (RKLB)", query: "Rocket Lab RKLB Neutron" },
  { key: "CRCL", label: "Circle (CRCL)", query: "Circle CRCL stablecoin USDC" },
  { key: "HOOD", label: "Robinhood (HOOD)", query: "Robinhood HOOD crypto" },
  { key: "COIN", label: "Coinbase (COIN)", query: "Coinbase COIN crypto" },
  { key: "TEM", label: "Tempus AI (TEM)", query: "Tempus AI TEM precision medicine" },
  { key: "Stripe", label: "Stripe", query: "Stripe payments fintech IPO" },
] as const;

// ========== 数据结构 ==========

export interface GeopoliticalNews {
  iranCeasefire: GeoNewsItem[];
  hormuzStrait: GeoNewsItem[];
  /** 加密标的新闻，key 为标的代码 (BTC, ETH, ...) */
  cryptoTopics: Record<string, GeoNewsItem[]>;
  /** 美股标的新闻，key 为标的代码 (NVDA, TSLA, ...) */
  stockTopics: Record<string, GeoNewsItem[]>;
}

const EMPTY_GEO_NEWS: GeopoliticalNews = {
  iranCeasefire: [],
  hormuzStrait: [],
  cryptoTopics: {},
  stockTopics: {},
};

/** 获取所有专题新闻（地缘政治 + 加密标的 + 美股标的） */
export async function fetchGeopoliticalNews(): Promise<GeopoliticalNews> {
  const token = process.env.NEWS_6551_TOKEN;
  if (!token) {
    console.error("[Topics] NEWS_6551_TOKEN 未设置，跳过专题新闻获取");
    return EMPTY_GEO_NEWS;
  }

  // 1. 地缘政治搜索（每个主题 3 路：英文新闻 + 中文新闻 + 推文）
  const geoPromises = GEO_TOPICS.flatMap((t) => [
    searchNews(token, t.newsEn, 10),
    searchNews(token, t.newsCn, 5),
    searchTwitter(token, t.tweets, 10),
  ]);

  // 2. 加密标的搜索（每个标的 1 路新闻，limit 5）
  const cryptoPromises = CRYPTO_TOPICS.map((t) =>
    searchNews(token, t.query, 5)
  );

  // 3. 美股标的搜索（每个标的 1 路新闻，limit 5）
  const stockPromises = STOCK_TOPICS.map((t) =>
    searchNews(token, t.query, 5)
  );

  // 全部并发
  const allResults = await Promise.all([
    ...geoPromises,
    ...cryptoPromises,
    ...stockPromises,
  ]);

  // 拆分结果
  let idx = 0;

  // 地缘政治（每个主题 3 个结果）
  const geoResults: Record<string, GeoNewsItem[]> = {};
  for (const t of GEO_TOPICS) {
    const newsEn = allResults[idx++];
    const newsCn = allResults[idx++];
    const tweets = allResults[idx++];
    geoResults[t.key] = [...newsEn, ...newsCn, ...tweets];
  }

  // 加密标的（每个主题 1 个结果）
  const cryptoTopics: Record<string, GeoNewsItem[]> = {};
  for (const t of CRYPTO_TOPICS) {
    cryptoTopics[t.key] = allResults[idx++];
  }

  // 美股标的（每个主题 1 个结果）
  const stockTopics: Record<string, GeoNewsItem[]> = {};
  for (const t of STOCK_TOPICS) {
    stockTopics[t.key] = allResults[idx++];
  }

  // 日志
  const cryptoCounts = CRYPTO_TOPICS.map((t) => `${t.key}:${cryptoTopics[t.key].length}`).join(" ");
  const stockCounts = STOCK_TOPICS.map((t) => `${t.key}:${stockTopics[t.key].length}`).join(" ");
  console.log(`[Topics] 地缘: 停火${geoResults.iranCeasefire.length} 海峡${geoResults.hormuzStrait.length} | 加密: ${cryptoCounts} | 美股: ${stockCounts}`);

  return {
    iranCeasefire: geoResults.iranCeasefire,
    hormuzStrait: geoResults.hormuzStrait,
    cryptoTopics,
    stockTopics,
  };
}

/** 格式化单个主题的新闻列表 */
function formatTopicItems(items: GeoNewsItem[]): string {
  return items
    .map(
      (n, i) =>
        `  [${i + 1}] ${n.title}\n      来源: ${n.source} | ${n.publishedAt}\n      ${n.summary}`
    )
    .join("\n\n");
}

/** 将专题新闻格式化为 Claude 能理解的文本 */
export function formatGeopoliticalNewsForPrompt(geo: GeopoliticalNews): string {
  const sections: string[] = [];

  // 地缘政治
  if (geo.iranCeasefire.length > 0) {
    sections.push(`【主题A：美国-伊朗停火/战争进展（共${geo.iranCeasefire.length}条）】\n${formatTopicItems(geo.iranCeasefire)}`);
  }
  if (geo.hormuzStrait.length > 0) {
    sections.push(`【主题B：伊朗与霍尔木兹海峡（共${geo.hormuzStrait.length}条）】\n${formatTopicItems(geo.hormuzStrait)}`);
  }

  // 加密标的新闻
  const cryptoLines: string[] = [];
  for (const t of CRYPTO_TOPICS) {
    const items = geo.cryptoTopics[t.key] ?? [];
    if (items.length > 0) {
      cryptoLines.push(`  ▸ ${t.label}（${items.length}条）\n${formatTopicItems(items)}`);
    }
  }
  if (cryptoLines.length > 0) {
    sections.push(`【加密标的相关新闻】\n${cryptoLines.join("\n\n")}`);
  }

  // 美股标的新闻
  const stockLines: string[] = [];
  for (const t of STOCK_TOPICS) {
    const items = geo.stockTopics[t.key] ?? [];
    if (items.length > 0) {
      stockLines.push(`  ▸ ${t.label}（${items.length}条）\n${formatTopicItems(items)}`);
    }
  }
  if (stockLines.length > 0) {
    sections.push(`【美股标的相关新闻】\n${stockLines.join("\n\n")}`);
  }

  return sections.length > 0 ? "\n\n" + sections.join("\n\n") : "";
}
