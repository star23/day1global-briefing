// ========== 获取美股数据 ==========
// 优先使用 Twelve Data API（支持批量请求，数据更准确）
// 如未设置 TWELVEDATA_API_KEY，回退到 Finnhub + Yahoo Finance
// 对于 Twelve Data 获取失败的个别标的，自动用 Finnhub/Yahoo 补全

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

/** 解析 Twelve Data 报价为 StockData，失败返回 null */
function parseTwelveDataStock(q: TwelveDataQuote): StockData | null {
  if ((q as Record<string, unknown>).status === "error") return null;

  const price = parseFloat(q.close);
  const percentChange = parseFloat(q.percent_change);

  if (isNaN(price) || price === 0) return null;

  return {
    price,
    changePercent: isNaN(percentChange) ? 0 : percentChange,
    marketState: q.is_market_open === true ? "regular" : "closed",
  };
}

/** 解析 Twelve Data 报价为 IndexData，失败返回 null */
function parseTwelveDataIndex(q: TwelveDataQuote): IndexData | null {
  if ((q as Record<string, unknown>).status === "error") return null;

  const price = parseFloat(q.close);
  const pctChange = parseFloat(q.percent_change);

  if (isNaN(price) || price === 0) return null;

  return { price, changePercent: isNaN(pctChange) ? 0 : pctChange };
}

// ========== Finnhub 实现（回退方案） ==========

/** 从 Finnhub 获取单只股票报价 */
async function fetchFinnhubQuote(
  symbol: string
): Promise<{ price: number; changePercent: number } | null> {
  if (!FINNHUB_API_KEY) return null;
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
  if (!FINNHUB_API_KEY) return "closed";
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

// ---- Yahoo Finance（VIX/黄金回退方案） ----

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

/**
 * 获取所有美股数据
 * 策略：Twelve Data 批量获取 → 失败的个别标的用 Finnhub 补全
 */
export async function fetchAllStocks(): Promise<{
  [ticker: string]: StockData;
}> {
  const results: { [ticker: string]: StockData } = {};
  const missingSymbols: string[] = [];

  // 第一步：尝试 Twelve Data 批量获取
  if (TWELVEDATA_API_KEY) {
    const quotes = await fetchTwelveDataQuotes(STOCK_SYMBOLS);

    if (quotes) {
      for (const symbol of STOCK_SYMBOLS) {
        const q = quotes[symbol];
        if (!q) {
          missingSymbols.push(symbol);
          continue;
        }
        const parsed = parseTwelveDataStock(q);
        if (parsed) {
          results[symbol] = parsed;
        } else {
          console.warn(`[TwelveData] ${symbol} 数据无效，将用 Finnhub 补全`);
          missingSymbols.push(symbol);
        }
      }
      console.log(`[TwelveData] 成功 ${Object.keys(results).length}/${STOCK_SYMBOLS.length} 只股票` +
        (missingSymbols.length > 0 ? `，缺失: ${missingSymbols.join(",")}` : ""));
    } else {
      // Twelve Data 完全失败，所有标的都需要回退
      missingSymbols.push(...STOCK_SYMBOLS);
    }
  } else {
    missingSymbols.push(...STOCK_SYMBOLS);
  }

  // 第二步：用 Finnhub 补全缺失的标的
  if (missingSymbols.length > 0 && FINNHUB_API_KEY) {
    console.log(`[Finnhub] 补全 ${missingSymbols.length} 只股票: ${missingSymbols.join(",")}`);

    // 获取市场状态（仅当需要 Finnhub 时才调用）
    const [marketState, ...quotes] = await Promise.all([
      fetchMarketStatus(),
      ...missingSymbols.map((s) => fetchFinnhubQuote(s)),
    ]);

    missingSymbols.forEach((symbol, i) => {
      const data = quotes[i];
      if (data) {
        results[symbol] = {
          price: data.price,
          changePercent: data.changePercent,
          // 如果已有 Twelve Data 的 marketState 信息，统一使用；否则用 Finnhub
          marketState: Object.values(results).length > 0
            ? Object.values(results)[0].marketState
            : marketState,
        };
      }
    });
  }

  return results;
}

/**
 * 获取指数数据（VIX 和黄金）
 * 策略：逐个独立获取 + 回退，VIX 和黄金互不影响
 */
export async function fetchIndices(): Promise<{
  vix: IndexData | null;
  gold: IndexData | null;
}> {
  let vix: IndexData | null = null;
  let gold: IndexData | null = null;

  // 第一步：尝试 Twelve Data
  if (TWELVEDATA_API_KEY) {
    const quotes = await fetchTwelveDataQuotes(["VIX", "XAU/USD"]);

    if (quotes) {
      const vixQ = quotes["VIX"];
      if (vixQ) {
        vix = parseTwelveDataIndex(vixQ);
        if (!vix) console.warn("[TwelveData] VIX 数据无效，将用 Yahoo 回退");
      } else {
        console.warn("[TwelveData] VIX 无数据，将用 Yahoo 回退");
      }

      const goldQ = quotes["XAU/USD"];
      if (goldQ) {
        gold = parseTwelveDataIndex(goldQ);
        if (!gold) console.warn("[TwelveData] XAU/USD 数据无效，将用 Yahoo 回退");
      } else {
        console.warn("[TwelveData] XAU/USD 无数据，将用 Yahoo 回退");
      }
    }
  }

  // 第二步：Yahoo Finance 补全缺失的指标（VIX 和黄金独立回退）
  const yahooTasks: Promise<void>[] = [];

  if (!vix) {
    yahooTasks.push(
      fetchYahooSymbol("^VIX").then((data) => {
        if (data) {
          vix = { price: data.price, changePercent: data.changePercent };
          console.log(`[Yahoo] VIX 回退成功: ${data.price}`);
        }
      })
    );
  }

  if (!gold) {
    yahooTasks.push(
      fetchYahooSymbol("GC=F").then((data) => {
        if (data) {
          gold = { price: data.price, changePercent: data.changePercent };
          console.log(`[Yahoo] Gold 回退成功: ${data.price}`);
        }
      })
    );
  }

  if (yahooTasks.length > 0) {
    await Promise.all(yahooTasks);
  }

  return { vix, gold };
}
