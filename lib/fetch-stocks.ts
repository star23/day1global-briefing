// ========== 获取美股数据 ==========
// 优先使用 Twelve Data API（支持批量请求，数据更准确）
// 如未设置 TWELVEDATA_API_KEY，回退到 Finnhub + Yahoo Finance
// VIX 和黄金也通过 Twelve Data 获取

import { StockData, IndexData } from "./types";

// 需要获取的美股标的列表
const STOCK_SYMBOLS = ["VOO", "QQQM", "NVDA", "TSLA", "GOOG", "RKLB", "CRCL", "HOOD", "COIN"];

const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// ========== Twelve Data 实现 ==========

/** Twelve Data /quote 返回的单只标的数据 */
interface TwelveDataQuote {
  symbol: string;
  name: string;
  close: string;
  previous_close: string;
  change: string;
  percent_change: string;
  is_market_open: boolean;
  [key: string]: unknown;
}

/**
 * 通过 Twelve Data 批量获取股票报价
 * 支持最多 120 个 symbol 一次调用
 */
async function fetchTwelveDataQuotes(
  symbols: string[]
): Promise<Record<string, TwelveDataQuote> | null> {
  try {
    const symbolStr = symbols.join(",");
    const url = `https://api.twelvedata.com/quote?symbol=${symbolStr}&apikey=${TWELVEDATA_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[TwelveData] 批量请求失败: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // 单个 symbol 时返回的是对象而非嵌套对象
    if (symbols.length === 1) {
      if (data.status === "error") {
        console.error(`[TwelveData] ${symbols[0]} 错误: ${data.message}`);
        return null;
      }
      return { [symbols[0]]: data as TwelveDataQuote };
    }

    // 多个 symbol 时返回 { "VOO": {...}, "QQQM": {...} }
    return data as Record<string, TwelveDataQuote>;
  } catch (err) {
    console.error("[TwelveData] 批量请求出错:", err);
    return null;
  }
}

/** 使用 Twelve Data 获取所有美股数据 */
async function fetchAllStocksTwelveData(): Promise<{
  [ticker: string]: StockData;
}> {
  const quotes = await fetchTwelveDataQuotes(STOCK_SYMBOLS);
  if (!quotes) return {};

  const results: { [ticker: string]: StockData } = {};

  for (const symbol of STOCK_SYMBOLS) {
    const q = quotes[symbol];
    if (!q || (q as Record<string, unknown>).status === "error") {
      console.error(`[TwelveData] ${symbol} 无数据或出错`);
      continue;
    }

    const price = parseFloat(q.close);
    const percentChange = parseFloat(q.percent_change);

    if (isNaN(price) || price === 0) {
      console.error(`[TwelveData] ${symbol} 价格无效: ${q.close}`);
      continue;
    }

    let marketState: StockData["marketState"] = "closed";
    if (q.is_market_open === true) {
      marketState = "regular";
    }

    results[symbol] = {
      price,
      changePercent: isNaN(percentChange) ? 0 : percentChange,
      marketState,
    };
  }

  console.log(`[TwelveData] 成功获取 ${Object.keys(results).length}/${STOCK_SYMBOLS.length} 只股票`);
  return results;
}

/** 使用 Twelve Data 获取 VIX 和黄金 */
async function fetchIndicesTwelveData(): Promise<{
  vix: IndexData | null;
  gold: IndexData | null;
}> {
  // VIX 作为指数，黄金使用 XAU/USD 外汇对
  const quotes = await fetchTwelveDataQuotes(["VIX", "XAU/USD"]);
  if (!quotes) return { vix: null, gold: null };

  let vix: IndexData | null = null;
  let gold: IndexData | null = null;

  const vixQ = quotes["VIX"];
  if (vixQ && (vixQ as Record<string, unknown>).status !== "error") {
    const price = parseFloat(vixQ.close);
    const pctChange = parseFloat(vixQ.percent_change);
    if (!isNaN(price) && price > 0) {
      vix = { price, changePercent: isNaN(pctChange) ? 0 : pctChange };
    }
  }

  const goldQ = quotes["XAU/USD"];
  if (goldQ && (goldQ as Record<string, unknown>).status !== "error") {
    const price = parseFloat(goldQ.close);
    const pctChange = parseFloat(goldQ.percent_change);
    if (!isNaN(price) && price > 0) {
      gold = { price, changePercent: isNaN(pctChange) ? 0 : pctChange };
    }
  }

  return { vix, gold };
}

// ========== Finnhub 实现（回退方案） ==========

/** 从 Finnhub 获取单只股票报价 */
async function fetchFinnhubQuote(
  symbol: string
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`Finnhub 请求失败 [${symbol}]: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Finnhub 返回 c=0 表示未找到该标的
    if (!data.c || data.c === 0) {
      console.error(`Finnhub 无数据 [${symbol}]`);
      return null;
    }

    return {
      price: data.c,   // current price
      changePercent: data.dp, // percent change from previous close
    };
  } catch (err) {
    console.error(`获取 ${symbol} 数据出错:`, err);
    return null;
  }
}

/** 获取美股市场状态（盘中/休市） */
async function fetchMarketStatus(): Promise<StockData["marketState"]> {
  try {
    const url = `https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return "closed";

    const data = await res.json();
    if (data.isOpen) return "regular";
    return "closed";
  } catch {
    return "closed";
  }
}

/** 使用 Finnhub 获取所有美股数据（回退方案） */
async function fetchAllStocksFinnhub(): Promise<{
  [ticker: string]: StockData;
}> {
  if (!FINNHUB_API_KEY) {
    console.error("FINNHUB_API_KEY 未设置");
    return {};
  }

  const results: { [ticker: string]: StockData } = {};

  // 并发获取市场状态和所有股票报价
  const [marketState, ...quotes] = await Promise.all([
    fetchMarketStatus(),
    ...STOCK_SYMBOLS.map((symbol) => fetchFinnhubQuote(symbol)),
  ]);

  STOCK_SYMBOLS.forEach((symbol, i) => {
    const data = quotes[i];
    if (data) {
      results[symbol] = {
        price: data.price,
        changePercent: data.changePercent,
        marketState,
      };
    }
  });

  return results;
}

// ---- Yahoo Finance（Twelve Data 回退方案） ----

/** 从 Yahoo Finance 获取单个指数/商品数据 */
async function fetchYahooSymbol(
  symbol: string
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
      price: meta.regularMarketPrice ?? 0,
      changePercent:
        ((meta.regularMarketPrice - meta.chartPreviousClose) /
          meta.chartPreviousClose) *
        100,
    };
  } catch {
    return null;
  }
}

// ========== 对外导出函数 ==========

/** 获取所有美股数据，优先 Twelve Data，回退 Finnhub */
export async function fetchAllStocks(): Promise<{
  [ticker: string]: StockData;
}> {
  if (TWELVEDATA_API_KEY) {
    console.log("[数据源] 使用 Twelve Data 获取美股数据");
    const result = await fetchAllStocksTwelveData();
    // 如果 Twelve Data 返回了数据就使用，否则回退
    if (Object.keys(result).length > 0) return result;
    console.warn("[TwelveData] 无有效数据，回退到 Finnhub");
  }

  console.log("[数据源] 使用 Finnhub 获取美股数据");
  return fetchAllStocksFinnhub();
}

/** 获取指数数据（VIX 和黄金），优先 Twelve Data，回退 Yahoo Finance */
export async function fetchIndices(): Promise<{
  vix: IndexData | null;
  gold: IndexData | null;
}> {
  if (TWELVEDATA_API_KEY) {
    console.log("[数据源] 使用 Twelve Data 获取 VIX 和黄金");
    const result = await fetchIndicesTwelveData();
    // 只要有至少一个有效数据就使用
    if (result.vix || result.gold) return result;
    console.warn("[TwelveData] VIX/黄金无有效数据，回退到 Yahoo Finance");
  }

  console.log("[数据源] 使用 Yahoo Finance 获取 VIX 和黄金");
  const [vixData, goldData] = await Promise.all([
    fetchYahooSymbol("^VIX"),
    fetchYahooSymbol("GC=F"),
  ]);

  return {
    vix: vixData
      ? { price: vixData.price, changePercent: vixData.changePercent }
      : null,
    gold: goldData
      ? { price: goldData.price, changePercent: goldData.changePercent }
      : null,
  };
}
