// ========== 获取地缘政治新闻 ==========
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

export interface GeopoliticalNews {
  iranCeasefire: GeoNewsItem[];
  hormuzStrait: GeoNewsItem[];
  tao: GeoNewsItem[];
}

/** 获取专题新闻（地缘政治 + 关注币种） */
export async function fetchGeopoliticalNews(): Promise<GeopoliticalNews> {
  const token = process.env.NEWS_6551_TOKEN;
  if (!token) {
    console.error("[Geopolitical] NEWS_6551_TOKEN 未设置，跳过专题新闻获取");
    return { iranCeasefire: [], hormuzStrait: [], tao: [] };
  }

  // 并发搜索所有主题（新闻 + 推文）
  const [
    ceaseNewsEn,
    ceaseNewsCn,
    ceaseTweetsEn,
    hormuzNewsEn,
    hormuzNewsCn,
    hormuzTweetsEn,
    taoNewsEn,
    taoNewsCn,
    taoTweetsEn,
  ] = await Promise.all([
    searchNews(token, "Iran ceasefire war", 10),
    searchNews(token, "伊朗 停火", 5),
    searchTwitter(token, "Iran ceasefire war deal", 10),
    searchNews(token, "Hormuz strait blockade Iran", 10),
    searchNews(token, "霍尔木兹海峡 封锁", 5),
    searchTwitter(token, "Strait of Hormuz Iran blockade", 10),
    searchNews(token, "Bittensor TAO", 10),
    searchNews(token, "TAO Bittensor 去中心化AI", 5),
    searchTwitter(token, "Bittensor TAO subnet", 10),
  ]);

  const taoAll = [...taoNewsEn, ...taoNewsCn, ...taoTweetsEn];

  console.log(
    `[Topics] 新闻获取完成: 停火 ${ceaseNewsEn.length + ceaseNewsCn.length + ceaseTweetsEn.length} 条, 海峡 ${hormuzNewsEn.length + hormuzNewsCn.length + hormuzTweetsEn.length} 条, TAO ${taoAll.length} 条`
  );

  return {
    iranCeasefire: [...ceaseNewsEn, ...ceaseNewsCn, ...ceaseTweetsEn],
    hormuzStrait: [...hormuzNewsEn, ...hormuzNewsCn, ...hormuzTweetsEn],
    tao: taoAll,
  };
}

/** 将地缘新闻格式化为 Claude 能理解的文本 */
export function formatGeopoliticalNewsForPrompt(geo: GeopoliticalNews): string {
  const sections: string[] = [];

  if (geo.iranCeasefire.length > 0) {
    const items = geo.iranCeasefire
      .map(
        (n, i) =>
          `  [${i + 1}] ${n.title}\n      来源: ${n.source} | ${n.publishedAt}\n      ${n.summary}`
      )
      .join("\n\n");
    sections.push(`【主题A：美国-伊朗停火/战争进展相关新闻和推文（共${geo.iranCeasefire.length}条）】\n${items}`);
  }

  if (geo.hormuzStrait.length > 0) {
    const items = geo.hormuzStrait
      .map(
        (n, i) =>
          `  [${i + 1}] ${n.title}\n      来源: ${n.source} | ${n.publishedAt}\n      ${n.summary}`
      )
      .join("\n\n");
    sections.push(`【主题B：伊朗与霍尔木兹海峡相关新闻和推文（共${geo.hormuzStrait.length}条）】\n${items}`);
  }

  if (geo.tao.length > 0) {
    const items = geo.tao
      .map(
        (n, i) =>
          `  [${i + 1}] ${n.title}\n      来源: ${n.source} | ${n.publishedAt}\n      ${n.summary}`
      )
      .join("\n\n");
    sections.push(`【主题C：Bittensor (TAO) 相关新闻和推文（共${geo.tao.length}条）】\n${items}`);
  }

  return sections.length > 0 ? "\n\n" + sections.join("\n\n") : "";
}
