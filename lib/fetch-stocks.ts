// ========== 获取美股数据 ==========
// 股票报价使用 Finnhub API（需要免费 API Key）
// VIX、黄金现货 (XAUUSD=X) 等指数/商品仍使用 Yahoo Finance

import { StockData, IndexData } from "./types";

// 需要获取的美股标的列表
const STOCK_SYMBOLS = ["VOO", "QQQ", "QQQM", "NVDA", "TSLA", "GOOG", "RKLB", "CRCL", "HOOD", "COIN", "TEM", "GLD"];

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/** 从 Finnhub 获取单只股票报价 */
async function fetchFinnhubQuote(
  symbol: string
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });

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
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return "closed";

    const data = await res.json();
    if (data.isOpen) return "regular";
    return "closed";
  } catch {
    return "closed";
  }
}

/** 获取所有美股数据，返回 { 股票代码: 数据 } 的映射 */
export async function fetchAllStocks(): Promise<{
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

// ---- VIX、黄金现货等：使用 Yahoo Finance ----

/** 从 Yahoo Finance 获取单个指数/商品数据 */
async function fetchYahooSymbol(
  symbol: string
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      cache: 'no-store',
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

/** 获取指数数据（S&P 500、VIX、黄金现货 XAU/USD、原油、美元指数） */
export async function fetchIndices(): Promise<{
  sp500: IndexData | null;
  vix: IndexData | null;
  gold: IndexData | null;
  crudeOil: IndexData | null;
  dxy: IndexData | null;
}> {
  const [sp500Data, vixData, goldData, oilData, dxyData] = await Promise.all([
    fetchYahooSymbol("^GSPC"),
    fetchYahooSymbol("^VIX"),
    fetchYahooSymbol("XAUUSD=X"),
    fetchYahooSymbol("CL=F"),
    fetchYahooSymbol("DX-Y.NYB"),
  ]);

  return {
    sp500: sp500Data
      ? { price: sp500Data.price, changePercent: sp500Data.changePercent }
      : null,
    vix: vixData
      ? { price: vixData.price, changePercent: vixData.changePercent }
      : null,
    gold: goldData
      ? { price: goldData.price, changePercent: goldData.changePercent }
      : null,
    crudeOil: oilData
      ? { price: oilData.price, changePercent: oilData.changePercent }
      : null,
    dxy: dxyData
      ? { price: dxyData.price, changePercent: dxyData.changePercent }
      : null,
  };
}
