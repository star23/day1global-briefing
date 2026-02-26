// ========== 获取加密恐慌贪婪指数 ==========
// 使用 CoinGlass API（与 BTC 链上指标同一 API Key，数据更及时）
//
// API 响应格式:
// { code: "0", data: [{ values: [number...], price: [number...], time_list: [number...] }] }
// values 数组最后一个元素为最新的恐慌贪婪指数 (0-100)

import { SentimentData } from "./types";

const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

/** 获取加密市场恐慌贪婪指数（CoinGlass） */
export async function fetchFearGreedIndex(): Promise<SentimentData> {
  const defaultData: SentimentData = {
    cryptoFearGreed: 50,
    cryptoFearGreedLabel: "Neutral",
    cnnFearGreed: null,
    cnnFearGreedLabel: null,
  };

  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    console.error("[CoinGlass] COINGLASS_API_KEY 未设置，无法获取恐慌贪婪指数");
    return defaultData;
  }

  try {
    const res = await fetch(`${COINGLASS_BASE}/api/index/fear-greed-history`, {
      headers: { "CG-API-KEY": apiKey, accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[CoinGlass] 恐慌贪婪指数请求失败: ${res.status}`);
      return defaultData;
    }

    const json = await res.json();

    if (json.code !== "0" || !json.data) {
      console.error("[CoinGlass] 恐慌贪婪指数数据异常:", json.msg || "无数据");
      return defaultData;
    }

    // data[0] 包含 values/price/time_list 三个平行数组
    const record = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : null;
    if (!record || !Array.isArray(record.values) || record.values.length === 0) {
      console.error("[CoinGlass] 恐慌贪婪指数数据为空");
      return defaultData;
    }

    // 取 values 数组最后一个元素（最新值）
    const value = Number(record.values[record.values.length - 1]);

    if (isNaN(value)) {
      console.error("[CoinGlass] 恐慌贪婪指数解析失败, 最后一条:", record.values.slice(-3));
      return defaultData;
    }

    // 根据数值生成标签
    const label =
      value <= 10 ? "Extreme Fear" :
      value <= 25 ? "Fear" :
      value <= 45 ? "Fear" :
      value <= 55 ? "Neutral" :
      value <= 75 ? "Greed" :
      "Extreme Greed";

    console.log(`[CoinGlass] 恐慌贪婪指数 = ${value} (${label})`);

    return {
      cryptoFearGreed: Math.round(value),
      cryptoFearGreedLabel: label,
      cnnFearGreed: null,
      cnnFearGreedLabel: null,
    };
  } catch (err) {
    console.error("[CoinGlass] 获取恐慌贪婪指数出错:", err);
    return defaultData;
  }
}
