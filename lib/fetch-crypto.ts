// ========== 获取加密货币数据 ==========
// 使用 OKX 公共 API 获取加密货币实时价格和24小时涨跌幅
// 无需 API Key，限流 20次/2秒

import { CryptoData } from "./types";

// OKX 交易对 → 显示代码的映射
const CRYPTO_MAP: { [instId: string]: string } = {
  "BTC-USDT": "BTC",
  "ETH-USDT": "ETH",
  "XAUT-USDT": "XAUT",
  "HYPE-USDT": "HYPE",
  "VIRTUAL-USDT": "VIRTUAL",
  "TAO-USDT": "TAO",
};

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

/** 获取所有加密货币数据 */
export async function fetchAllCrypto(): Promise<{
  [ticker: string]: CryptoData;
}> {
  const results: { [ticker: string]: CryptoData } = {};

  // 并发请求所有交易对
  const entries = Object.entries(CRYPTO_MAP);
  const promises = entries.map(async ([instId, ticker]) => {
    const data = await fetchOKXTicker(instId);
    if (data) {
      results[ticker] = {
        price: data.price,
        change24h: data.change24h,
      };
    }
  });

  await Promise.all(promises);
  return results;
}
