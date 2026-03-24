// ========== 获取加密恐慌贪婪指数 ==========
// 主数据源: CoinMarketCap Fear & Greed API
// 备用数据源: CoinGlass（用于对比日志）
// CMC 响应格式: { data: [{ value: number, value_classification: string, timestamp: string }, ...] }

import { SentimentData } from "./types";

const CMC_BASE = "https://pro-api.coinmarketcap.com";
const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

function getLabel(value: number): string {
  if (value <= 10) return "Extreme Fear";
  if (value <= 25) return "Fear";
  if (value <= 45) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 75) return "Greed";
  return "Extreme Greed";
}

/** 从 CoinMarketCap 获取恐惧贪婪指数 */
async function fetchFromCMC(): Promise<{ today: number; yesterday: number | null; label: string } | null> {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    console.warn("[CMC] CMC_API_KEY 未设置，跳过 CMC 数据源");
    return null;
  }

  try {
    const res = await fetch(`${CMC_BASE}/v3/fear-and-greed/historical?limit=2`, {
      cache: "no-store",
      headers: { "X-CMC_PRO_API_KEY": apiKey, accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[CMC] 恐惧贪婪指数请求失败: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const entries = json?.data;

    if (!Array.isArray(entries) || entries.length === 0) {
      console.error("[CMC] 恐惧贪婪指数数据为空");
      return null;
    }

    const today = Math.round(Number(entries[0].value));
    const label = entries[0].value_classification || getLabel(today);
    const yesterday = entries.length >= 2 ? Math.round(Number(entries[1].value)) : null;

    if (isNaN(today)) {
      console.error("[CMC] 恐惧贪婪指数解析失败:", entries[0]);
      return null;
    }

    console.log(`[CMC] 恐惧贪婪指数: 今日=${today} (${label}), 昨日=${yesterday}`);
    return { today, yesterday, label };
  } catch (err) {
    console.error("[CMC] 获取恐惧贪婪指数出错:", err);
    return null;
  }
}

/** 从 CoinGlass 获取恐惧贪婪指数（备用 + 对比） */
async function fetchFromCoinGlass(): Promise<{ today: number; yesterday: number | null; label: string } | null> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${COINGLASS_BASE}/api/index/fear-greed-history`, {
      cache: "no-store",
      headers: { "CG-API-KEY": apiKey, accept: "application/json" },
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json.code !== "0" || !json.data) return null;

    const dataList: number[] | undefined = json.data.data_list;
    if (!Array.isArray(dataList) || dataList.length === 0) return null;

    const today = Math.round(Number(dataList[dataList.length - 1]));
    const yesterday = dataList.length >= 2 ? Math.round(Number(dataList[dataList.length - 2])) : null;

    if (isNaN(today)) return null;

    console.log(`[CoinGlass] 恐惧贪婪指数: 今日=${today} (${getLabel(today)}), 昨日=${yesterday}`);
    return { today, yesterday, label: getLabel(today) };
  } catch {
    return null;
  }
}

/** 获取加密市场恐惧贪婪指数（主: CMC，备: CoinGlass） */
export async function fetchFearGreedIndex(): Promise<SentimentData> {
  const defaultData: SentimentData = {
    cryptoFearGreed: 50,
    cryptoFearGreedLabel: "Neutral",
    cryptoFearGreedPrev: null,
    cryptoFearGreedChange: null,
    cnnFearGreed: null,
    cnnFearGreedLabel: null,
  };

  // 并发请求两个数据源
  const [cmcResult, coinglassResult] = await Promise.all([
    fetchFromCMC(),
    fetchFromCoinGlass(),
  ]);

  // 对比两个数据源
  if (cmcResult && coinglassResult) {
    const diff = cmcResult.today - coinglassResult.today;
    console.log(
      `[FearGreed 对比] CMC=${cmcResult.today} (${cmcResult.label}) vs CoinGlass=${coinglassResult.today} (${coinglassResult.label}), 差值=${diff > 0 ? "+" : ""}${diff}`
    );
  }

  // 优先使用 CMC，fallback 到 CoinGlass
  const result = cmcResult || coinglassResult;

  if (!result) {
    console.error("[FearGreed] CMC 和 CoinGlass 均获取失败，使用默认值");
    return defaultData;
  }

  const change = result.yesterday !== null ? result.today - result.yesterday : null;

  return {
    cryptoFearGreed: result.today,
    cryptoFearGreedLabel: result.label,
    cryptoFearGreedPrev: result.yesterday,
    cryptoFearGreedChange: change,
    cnnFearGreed: null,
    cnnFearGreedLabel: null,
  };
}
