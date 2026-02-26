// ========== 获取加密恐慌贪婪指数 ==========
// 使用 CoinGlass API（与 BTC 链上指标同一 API Key）
// 响应格式: { code: "0", data: { data_list: [number...], price_list: [...], time_list: [...] } }
// data_list 最后一个元素为最新值，倒数第二个为昨日值

import { SentimentData } from "./types";

const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

function getLabel(value: number): string {
  if (value <= 10) return "Extreme Fear";
  if (value <= 25) return "Fear";
  if (value <= 45) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 75) return "Greed";
  return "Extreme Greed";
}

/** 获取加密市场恐慌贪婪指数（CoinGlass） */
export async function fetchFearGreedIndex(): Promise<SentimentData> {
  const defaultData: SentimentData = {
    cryptoFearGreed: 50,
    cryptoFearGreedLabel: "Neutral",
    cryptoFearGreedPrev: null,
    cryptoFearGreedChange: null,
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

    // 从 data.data_list 数组提取今日和昨日值
    const dataList: number[] | undefined = json.data.data_list;
    if (!Array.isArray(dataList) || dataList.length === 0) {
      console.error("[CoinGlass] 恐慌贪婪指数 data_list 为空或缺失, keys:", Object.keys(json.data));
      return defaultData;
    }

    const today = Math.round(Number(dataList[dataList.length - 1]));
    const yesterday = dataList.length >= 2 ? Math.round(Number(dataList[dataList.length - 2])) : null;

    if (isNaN(today)) {
      console.error("[CoinGlass] 恐慌贪婪指数解析失败, 最后几条:", dataList.slice(-3));
      return defaultData;
    }

    const change = yesterday !== null && !isNaN(yesterday) ? today - yesterday : null;

    console.log(`[CoinGlass] 恐慌贪婪指数: 今日=${today} (${getLabel(today)}), 昨日=${yesterday}, 变化=${change}`);

    return {
      cryptoFearGreed: today,
      cryptoFearGreedLabel: getLabel(today),
      cryptoFearGreedPrev: yesterday,
      cryptoFearGreedChange: change,
      cnnFearGreed: null,
      cnnFearGreedLabel: null,
    };
  } catch (err) {
    console.error("[CoinGlass] 获取恐慌贪婪指数出错:", err);
    return defaultData;
  }
}
