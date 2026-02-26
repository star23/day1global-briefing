// ========== 获取加密恐慌贪婪指数 ==========
// 使用 CoinGlass API（与 BTC 链上指标同一 API Key，数据更及时）
// 兼容多种响应格式（并行数组 / 独立记录数组 / 单对象）

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

    // CoinGlass 可能返回两种格式:
    //   格式A (并行数组): { data: [{ values: [32, 23, ...], price: [...] }] }
    //   格式B (独立记录): { data: [{ value: 32, price: 47886 }, ...] }
    //   格式C (对象):     { data: { value: 32, ... } }
    let value: number | undefined;

    if (Array.isArray(json.data) && json.data.length > 0) {
      const first = json.data[0];
      if (Array.isArray(first.values) && first.values.length > 0) {
        // 格式A: 并行数组，取最后一个元素
        value = Number(first.values[first.values.length - 1]);
        console.log(`[CoinGlass] Fear&Greed 格式A: values数组长度=${first.values.length}, 最新值=${value}`);
      } else {
        // 格式B: 独立记录数组，取最后一条的 value 字段
        const last = json.data[json.data.length - 1];
        value = Number(last.value ?? last.values ?? last.fear_greed ?? last.fearGreed);
        console.log(`[CoinGlass] Fear&Greed 格式B: 记录数=${json.data.length}, 最后一条keys=[${Object.keys(last).join(",")}], 值=${value}`);
      }
    } else if (typeof json.data === "object" && json.data !== null) {
      // 格式C: 直接对象
      value = Number(json.data.value ?? json.data.values ?? json.data.fear_greed ?? json.data.fearGreed);
      console.log(`[CoinGlass] Fear&Greed 格式C: keys=[${Object.keys(json.data).join(",")}], 值=${value}`);
    } else {
      console.error("[CoinGlass] 恐慌贪婪指数数据格式未知:", typeof json.data);
      return defaultData;
    }

    if (value === undefined || isNaN(value)) {
      console.error("[CoinGlass] 恐慌贪婪指数解析失败, raw data sample:", JSON.stringify(json.data).slice(0, 300));
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
