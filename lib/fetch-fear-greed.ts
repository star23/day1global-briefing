// ========== 获取加密恐慌贪婪指数 ==========
// 使用 alternative.me 免费 API

import { SentimentData } from "./types";

/** 获取加密市场恐慌贪婪指数 */
export async function fetchFearGreedIndex(): Promise<SentimentData> {
  // 默认值：如果 API 失败，返回中性值
  const defaultData: SentimentData = {
    cryptoFearGreed: 50,
    cryptoFearGreedLabel: "Neutral",
    cnnFearGreed: null,
    cnnFearGreedLabel: null,
  };

  try {
    const url = "https://api.alternative.me/fng/?limit=1";
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`恐慌贪婪指数 API 请求失败: ${res.status}`);
      return defaultData;
    }

    const data = await res.json();
    const fngData = data?.data?.[0];

    if (!fngData) {
      return defaultData;
    }

    return {
      cryptoFearGreed: parseInt(fngData.value, 10),
      cryptoFearGreedLabel: fngData.value_classification ?? "Unknown",
      cnnFearGreed: null,
      cnnFearGreedLabel: null,
    };
  } catch (err) {
    console.error("获取恐慌贪婪指数出错:", err);
    return defaultData;
  }
}
