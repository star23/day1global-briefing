// ========== 获取新闻数据 ==========
// 从 Finnhub 获取市场新闻和加密新闻
// 供 AI 分析时精选今日必看 10 条

/** Finnhub 新闻条目原始格式 */
export interface RawNewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  category: string;
  related: string;
}

/** 获取最新的市场 + 加密新闻（取最近 30 条供 AI 精选） */
export async function fetchNews(): Promise<RawNewsItem[]> {
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_API_KEY) {
    console.log("[News] 未设置 FINNHUB_API_KEY，跳过新闻获取");
    return [];
  }

  try {
    const [generalRes, cryptoRes] = await Promise.all([
      fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`
      ),
      fetch(
        `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB_API_KEY}`
      ),
    ]);

    const general: RawNewsItem[] = generalRes.ok
      ? await generalRes.json()
      : [];
    const crypto: RawNewsItem[] = cryptoRes.ok
      ? await cryptoRes.json()
      : [];

    // 合并并按时间倒序，取最近 30 条供 Claude 精选
    const combined = [...general, ...crypto]
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 30);

    console.log(
      `[News] 获取到 ${general.length} 条市场新闻 + ${crypto.length} 条加密新闻，合计取 ${combined.length} 条`
    );
    return combined;
  } catch (err) {
    console.error("获取新闻失败:", err);
    return [];
  }
}
