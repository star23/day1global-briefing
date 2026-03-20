// ========== 获取加密货币数据 ==========
// 使用 OKX 公共 API 获取加密货币实时价格和24小时涨跌幅
// TAO 使用 Binance API（OKX 未上架），带多域名 fallback
// 无需 API Key

import { CryptoData } from "./types";

// OKX 交易对 → 显示代码的映射
const CRYPTO_MAP: { [instId: string]: string } = {
  "BTC-USDT": "BTC",
  "ETH-USDT": "ETH",
  "XAUT-USDT": "XAUT",
  "HYPE-USDT": "HYPE",
  "VIRTUAL-USDT": "VIRTUAL",
  "BNB-USDT": "BNB",
  "SOL-USDT": "SOL",
};

// Binance 交易对（OKX 未上架的币种）
const BINANCE_MAP: { [symbol: string]: string } = {
  "TAOUSDT": "TAO",
};

// Binance API 域名列表（按优先级排列，部分地区主域名不可用时自动 fallback）
const BINANCE_HOSTS = [
  "api.binance.com",
  "api1.binance.com",
  "api2.binance.com",
  "api3.binance.com",
  "api4.binance.com",
];

/** 从 OKX 获取单个交易对的行情 */
async function fetchOKXTicker(
  instId: string
): Promise<{ price: number; change24h: number } | null> {
  try {
    const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`OKX API 请求失败 [${instId}]: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.code !== "0" || !data.data?.[0]) {
      console.error(`OKX API 数据异常 [${instId}]:`, data.msg);
      return null;
    }

    const ticker = data.data[0];
    const last = parseFloat(ticker.last);
    const open24h = parseFloat(ticker.open24h);
    const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

    return { price: last, change24h };
  } catch (err) {
    console.error(`获取 ${instId} 数据出错:`, err);
    return null;
  }
}

/** 从 Binance 获取单个交易对的行情（多域名 fallback） */
async function fetchBinanceTicker(
  symbol: string
): Promise<{ price: number; change24h: number } | null> {
  for (const host of BINANCE_HOSTS) {
    try {
      const url = `https://${host}/api/v3/ticker/24hr?symbol=${symbol}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[Binance] ${host} 请求失败 [${symbol}]: ${res.status}, 尝试下一个域名`);
        continue;
      }

      const data = await res.json();
      const last = parseFloat(data.lastPrice);
      const change24h = parseFloat(data.priceChangePercent);

      if (isNaN(last) || isNaN(change24h)) {
        console.error(`[Binance] ${host} 数据解析异常 [${symbol}]:`, JSON.stringify(data).slice(0, 200));
        continue;
      }

      console.log(`[Binance] ${host} 获取 ${symbol} 成功: $${last} (${change24h}%)`);
      return { price: last, change24h };
    } catch (err) {
      console.warn(`[Binance] ${host} 请求出错 [${symbol}]:`, (err as Error).message);
      continue;
    }
  }

  console.error(`[Binance] 所有域名均失败 [${symbol}]`);
  return null;
}

/** 获取所有加密货币数据 */
export async function fetchAllCrypto(): Promise<{
  [ticker: string]: CryptoData;
}> {
  const results: { [ticker: string]: CryptoData } = {};

  // 并发请求 OKX + Binance 交易对
  const okxEntries = Object.entries(CRYPTO_MAP);
  const binanceEntries = Object.entries(BINANCE_MAP);

  const promises = [
    ...okxEntries.map(async ([instId, ticker]) => {
      const data = await fetchOKXTicker(instId);
      if (data) {
        results[ticker] = { price: data.price, change24h: data.change24h };
      }
    }),
    ...binanceEntries.map(async ([symbol, ticker]) => {
      const data = await fetchBinanceTicker(symbol);
      if (data) {
        results[ticker] = { price: data.price, change24h: data.change24h };
      }
    }),
  ];

  await Promise.all(promises);
  return results;
}
