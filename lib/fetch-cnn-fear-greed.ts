// ========== 获取 CNN 恐惧贪婪指数 ==========
// CNN Fear & Greed Index 衡量美股市场情绪 (0-100)

export interface CNNFearGreedData {
  score: number;    // 0-100
  label: string;    // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
}

/** 获取 CNN 恐惧贪婪指数 */
export async function fetchCNNFearGreed(): Promise<CNNFearGreedData | null> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`CNN Fear & Greed API 请求失败: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const fng = data?.fear_and_greed;

    if (!fng || typeof fng.score !== "number") {
      console.error("CNN Fear & Greed 数据解析失败");
      return null;
    }

    return {
      score: Math.round(fng.score),
      label: fng.rating ?? "Unknown",
    };
  } catch (err) {
    console.error("获取 CNN Fear & Greed 出错:", err);
    return null;
  }
}
