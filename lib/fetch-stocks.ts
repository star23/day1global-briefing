// ========== 获取美股数据 ==========
// 使用 Yahoo Finance 非官方 API 获取股票和指数的实时价格

import { StockData, IndexData } from "./types";

// 需要获取的美股标的列表
const STOCK_SYMBOLS = ["VOO", "QQQM", "NVDA", "TSLA", "GOOG", "RKLB", "CRCL", "HOOD", "COIN"];

// 指数和商品代码（VIX 波动率指数、黄金期货）
const INDEX_SYMBOLS = ["^VIX", "GC=F"];

/** 请求重试：如果请求失败，最多重试3次，每次间隔递增 */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          // Yahoo Finance 需要 User-Agent，否则可能被拒绝
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (res.ok) return res;
      // 如果是429（请求过多），等待更长时间再重试
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, (i + 1) * 2000));
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      // 等待后重试（指数退避：1秒、2秒、3秒）
      await new Promise((r) => setTimeout(r, (i + 1) * 1000));
    }
  }
  throw new Error("重试次数已用完");
}

/** 解析 Yahoo Finance 返回的市场状态 */
function parseMarketState(state: string): StockData["marketState"] {
  switch (state) {
    case "PRE":
      return "pre";
    case "REGULAR":
      return "regular";
    case "POST":
    case "POSTPOST":
      return "post";
    default:
      return "closed";
  }
}

/** 从 Yahoo Finance 获取单个标的的数据 */
async function fetchYahooSymbol(
  symbol: string
): Promise<{ price: number; changePercent: number; marketState: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      console.error(`Yahoo Finance 请求失败 [${symbol}]: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) {
      console.error(`Yahoo Finance 数据解析失败 [${symbol}]`);
      return null;
    }

    return {
      price: meta.regularMarketPrice ?? 0,
      changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      marketState: meta.marketState ?? "CLOSED",
    };
  } catch (err) {
    console.error(`获取 ${symbol} 数据出错:`, err);
    return null;
  }
}

/** 获取所有美股数据，返回 { 股票代码: 数据 } 的映射 */
export async function fetchAllStocks(): Promise<{ [ticker: string]: StockData }> {
  const results: { [ticker: string]: StockData } = {};

  // 并发请求所有股票数据（提高速度）
  const promises = STOCK_SYMBOLS.map(async (symbol) => {
    const data = await fetchYahooSymbol(symbol);
    if (data) {
      results[symbol] = {
        price: data.price,
        changePercent: data.changePercent,
        marketState: parseMarketState(data.marketState),
      };
    }
  });

  await Promise.all(promises);
  return results;
}

/** 获取指数数据（VIX 和黄金） */
export async function fetchIndices(): Promise<{
  vix: IndexData | null;
  gold: IndexData | null;
}> {
  const [vixData, goldData] = await Promise.all([
    fetchYahooSymbol("^VIX"),
    fetchYahooSymbol("GC=F"),
  ]);

  return {
    vix: vixData ? { price: vixData.price, changePercent: vixData.changePercent } : null,
    gold: goldData ? { price: goldData.price, changePercent: goldData.changePercent } : null,
  };
}
