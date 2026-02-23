// ========== 获取加密货币数据 ==========
// 使用 CoinGecko 免费 API 获取加密货币价格和24小时涨跌幅

import { CryptoData } from "./types";

// CoinGecko ID 到显示代码的映射
const CRYPTO_MAP: { [geckoId: string]: string } = {
  bitcoin: "BTC",
  ethereum: "ETH",
  "tether-gold": "XAUT",
  hyperliquid: "HYPE",
  "virtuals-protocol": "VIRTUAL",
};

// CoinGecko API 请求的 ID 列表（逗号分隔）
const COIN_IDS = Object.keys(CRYPTO_MAP).join(",");

/** 获取所有加密货币数据 */
export async function fetchAllCrypto(): Promise<{ [ticker: string]: CryptoData }> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error(`CoinGecko API 请求失败: ${res.status}`);
      return {};
    }

    const data = await res.json();
    const results: { [ticker: string]: CryptoData } = {};

    // 将 CoinGecko 返回的数据映射为我们需要的格式
    for (const [geckoId, ticker] of Object.entries(CRYPTO_MAP)) {
      const coinData = data[geckoId];
      if (coinData) {
        results[ticker] = {
          price: coinData.usd ?? 0,
          change24h: coinData.usd_24h_change ?? 0,
        };
      }
    }

    return results;
  } catch (err) {
    console.error("获取加密货币数据出错:", err);
    return {};
  }
}
