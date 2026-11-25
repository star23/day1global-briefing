// ========== 获取 BTC 链上/技术指标 ==========
// 从 OKX 获取 K 线数据计算周线 RSI 和成交量变化
// 从 CoinGlass 获取 AHR999 / STH-SOPR / LTH-SOPR / LTH Supply / 200WMA

import { accountRatioWeek, type AccountRatioDay } from "./binance-account-ratio";
import type { BTCMetrics } from "./types";
export type { BTCMetrics } from "./types";

// BTC 大致流通量（约 19.85M，每天增加约 450 BTC，误差 <0.1%）
const BTC_APPROX_CIRCULATING = 19_850_000;

/** CoinGlass API V4 基础 URL */
const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

export interface LatestAhr999 {
  date: string;
  ahr999: number;
  btcPrice: number | null;
}

/** 计算 RSI (Relative Strength Index) */
function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const values = closes.slice(-period);
  return values.reduce((sum, value) => sum + value, 0) / period;
}

function calculateEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;

  const seed = closes
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  let ema = seed;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

async function fetchBTCCandles(bar: "1Wutc" | "1Dutc"): Promise<string[][]> {
  const candles = new Map<number, string[]>();
  let after: string | null = null;

  const daily = bar === "1Dutc";
  for (let page = 0; page < (daily ? 4 : 3); page++) {
    const endpoint = page === 0 ? "candles" : "history-candles";
    const limit = page === 0 ? 300 : 100;
    const params = new URLSearchParams({
      instId: "BTC-USDT",
      bar,
      limit: String(limit),
    });
    if (after) params.set("after", after);

    const response = await fetch(
      `https://www.okx.com/api/v5/market/${endpoint}?${params.toString()}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    ).catch((err) => {
      if (!daily || candles.size === 0) throw err;
      return null;
    });
    if (!response?.ok) {
      if (daily && candles.size) break;
      throw new Error(`OKX ${bar} candles 请求失败: ${response?.status}`);
    }

    const json = await response.json();
    if (json.code !== "0" || !Array.isArray(json.data) || json.data.length === 0) {
      break;
    }

    for (const candle of json.data as string[][]) {
      const timestamp = Number(candle[0]);
      if (Number.isFinite(timestamp) && !candles.has(timestamp)) candles.set(timestamp, candle);
    }
    if (daily && candles.size >= 365) break;

    const oldestTimestamp = Math.min(
      ...json.data.map((candle: string[]) => Number(candle[0]))
    );
    if (!Number.isFinite(oldestTimestamp) || String(oldestTimestamp) === after) {
      break;
    }
    after = String(oldestTimestamp);
  }

  return Array.from(candles.entries())
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
}

function dailyAverages(candles: string[][]) {
  const closes: number[] = [];
  for (let i = candles.length - 1; i >= 0; i--) {
    const close = Number(candles[i][4]);
    if (!Number.isFinite(close) || close <= 0) break;
    if (i + 1 < candles.length && Number(candles[i + 1][0]) - Number(candles[i][0]) !== 86_400_000) break;
    closes.push(close);
  }
  closes.reverse();
  const ma120 = calculateSMA(closes, 120);
  const ma200 = calculateSMA(closes, 200);
  const ma365 = calculateSMA(closes, 365);
  return {
    ma120Price: ma120 === null ? null : Math.round(ma120),
    ma200Price: ma200 === null ? null : Math.round(ma200),
    ma365Price: ma365 === null ? null : Math.round(ma365),
    ma365Ratio: ma365 === null ? null : Number((closes[closes.length - 1] / ma365).toFixed(2)),
  };
}

/**
 * 从 CoinGlass 获取单个端点的最新数据记录
 * CoinGlass V4 响应格式: { code: "0", data: [ { timestamp, price, ...fields } ] }
 */
async function fetchCoinGlassLatest(
  apiKey: string,
  endpoint: string,
  label: string
): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`${COINGLASS_BASE}/api/index/${endpoint}`, {
      cache: 'no-store',
      headers: { "CG-API-KEY": apiKey, accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[CoinGlass] ${label} 请求失败: ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== "0" || !json.data) {
      console.error(`[CoinGlass] ${label} 数据异常:`, json.msg || "无数据");
      return null;
    }
    // data 可能是数组（时间序列）或对象
    if (Array.isArray(json.data)) {
      if (json.data.length === 0) {
        console.error(`[CoinGlass] ${label} 数据为空数组`);
        return null;
      }
      return json.data[json.data.length - 1];
    }
    if (typeof json.data === "object") {
      return json.data;
    }
    return null;
  } catch (err) {
    console.error(`[CoinGlass] 获取 ${label} 出错:`, err);
    return null;
  }
}

async function fetchAhr999WithKey(
  apiKey: string
): Promise<LatestAhr999 | null> {
  const data = await fetchCoinGlassLatest(apiKey, "ahr999", "AHR999");
  if (!data) return null;

  const ahr999 = Number(data.ahr999_value);
  if (!Number.isFinite(ahr999) || ahr999 <= 0) return null;

  const btcPrice = Number(data.current_value);
  const rawDate = String(data.date_string || "");

  return {
    date: rawDate.replace(/\//g, "-"),
    ahr999: Math.round(ahr999 * 10_000) / 10_000,
    btcPrice:
      Number.isFinite(btcPrice) && btcPrice > 0 ? btcPrice : null,
  };
}

/** 仅获取最新 AHR999，供轻量级接口在数据库暂无数据时降级使用 */
export async function fetchLatestAhr999(): Promise<LatestAhr999 | null> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    console.warn("[CoinGlass] 未设置 COINGLASS_API_KEY，无法获取 AHR999");
    return null;
  }
  return fetchAhr999WithKey(apiKey);
}


/**
 * 从 CoinGlass 获取 BTC ETF 每日净流入
 * 端点: /api/etf/bitcoin/flow-history
 * 取最近 6 天数据：如果最新一天为 0 则从倒数第二天开始
 * 连续 3 天净流入 = 强买入信号，连续 5 天净流出 = 强卖出信号
 */
async function fetchETFFlow(apiKey: string): Promise<{ etfFlowUsd: number | null; etfFlowDays: number[] }> {
  try {
    const res = await fetch(`${COINGLASS_BASE}/api/etf/bitcoin/flow-history`, {
      cache: "no-store",
      headers: { "CG-API-KEY": apiKey, accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[CoinGlass] ETF Flow 请求失败: ${res.status}`);
      return { etfFlowUsd: null, etfFlowDays: [] };
    }
    const json = await res.json();
    if (json.code !== "0" || !Array.isArray(json.data) || json.data.length < 2) {
      console.error(`[CoinGlass] ETF Flow 数据异常:`, json.msg || "无数据");
      return { etfFlowUsd: null, etfFlowDays: [] };
    }
    const len = json.data.length;

    // 确定起始位置：如果最新一天为 0（周末/无数据），从倒数第二天开始
    const lastFlow = Number(json.data[len - 1]?.flow_usd);
    const startIdx = (lastFlow === 0 || isNaN(lastFlow)) ? len - 2 : len - 1;

    // 从起始位置往前取 6 天
    const etfFlowDays: number[] = [];
    for (let i = startIdx; i > startIdx - 6 && i >= 0; i--) {
      const v = Number(json.data[i]?.flow_usd);
      if (!isNaN(v)) etfFlowDays.push(v);
    }

    const etfFlowUsd = etfFlowDays.length > 0 ? etfFlowDays[0] : null;
    if (etfFlowUsd === null) return { etfFlowUsd: null, etfFlowDays: [] };

    console.log(`[CoinGlass] ETF Flow = $${(etfFlowUsd / 1e6).toFixed(1)}M (${etfFlowDays.length}日: ${etfFlowDays.map(v => `$${(v / 1e6).toFixed(1)}M`).join(", ")})`);
    return { etfFlowUsd, etfFlowDays };
  } catch (err) {
    console.error(`[CoinGlass] 获取 ETF Flow 出错:`, err);
    return { etfFlowUsd: null, etfFlowDays: [] };
  }
}

/**
 * 从 CoinGlass 获取 BTC Funding Rate (Binance 8h)
 * 端点: /api/futures/funding-rate/history?exchange=Binance&symbol=BTCUSDT&interval=8h
 * 取数组最后一条的 close
 */
async function fetchFundingRate(apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/futures/funding-rate/history?exchange=Binance&symbol=BTCUSDT&interval=8h`,
      {
        cache: "no-store",
        headers: { "CG-API-KEY": apiKey, accept: "application/json" },
      }
    );
    if (!res.ok) {
      console.error(`[CoinGlass] Funding Rate 请求失败: ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== "0" || !Array.isArray(json.data) || json.data.length === 0) {
      console.error(`[CoinGlass] Funding Rate 数据异常:`, json.msg || "无数据");
      return null;
    }
    const latest = json.data[json.data.length - 1];
    const close = Number(latest.close);
    if (isNaN(close)) return null;
    console.log(`[CoinGlass] Funding Rate = ${close}%`);
    return close;
  } catch (err) {
    console.error(`[CoinGlass] 获取 Funding Rate 出错:`, err);
    return null;
  }
}

async function fetchLongShortHistory(apiKey: string): Promise<AccountRatioDay[]> {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/futures/global-long-short-account-ratio/history?exchange=Binance&symbol=BTCUSDT&interval=1d&limit=8`,
      {
        cache: "no-store",
        headers: { "CG-API-KEY": apiKey, accept: "application/json" },
      }
    );
    if (!res.ok) {
      console.error(`[CoinGlass] Long/Short Ratio 请求失败: ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (json.code !== "0" || !Array.isArray(json.data) || json.data.length === 0) {
      console.error(`[CoinGlass] Long/Short Ratio 数据异常:`, json.msg || "无数据");
      return [];
    }
    return accountRatioWeek(json.data);
  } catch (err) {
    console.error(`[CoinGlass] 获取 Long/Short Ratio 出错:`, err);
    return [];
  }
}

async function fetchOnChainMetrics(apiKey: string): Promise<{
  ahr999: number | null;
  sthSopr: number | null;
  lthSopr: number | null;
  lthSupplyPercent: number | null;
  wma200Price: number | null;
  wma200Multiplier: number | null;
  nupl: number | null;
  lthMvrv: number | null;
  etfFlowUsd: number | null;
  etfFlowDays: number[];
  fundingRate: number | null;
  longShortRatio: number | null;
  longShortHistory: AccountRatioDay[];
}> {
  const [ahr999Data, sthSoprData, lthSoprData, lthSupplyData, wma200Data, nuplData, lthRealizedData, etfFlowData, fundingRate, longShortHistory] =
    await Promise.all([
      fetchAhr999WithKey(apiKey),
      fetchCoinGlassLatest(apiKey, "bitcoin-sth-sopr", "STH-SOPR"),
      fetchCoinGlassLatest(apiKey, "bitcoin-lth-sopr", "LTH-SOPR"),
      fetchCoinGlassLatest(apiKey, "bitcoin-long-term-holder-supply", "LTH Supply"),
      fetchCoinGlassLatest(apiKey, "200-week-moving-average-heatmap", "200WMA"),
      fetchCoinGlassLatest(apiKey, "bitcoin-net-unrealized-profit-loss", "NUPL"),
      fetchCoinGlassLatest(apiKey, "bitcoin-lth-realized-price", "LTH Realized Price"),
      fetchETFFlow(apiKey),
      fetchFundingRate(apiKey),
      fetchLongShortHistory(apiKey),
    ]);

  const { etfFlowUsd, etfFlowDays } = etfFlowData;

  // --- AHR999 ---
  // /api/index/ahr999 返回时间序列，fetchCoinGlassLatest 已取数组最后一条
  let ahr999: number | null = null;
  if (ahr999Data) {
    ahr999 = ahr999Data.ahr999;
    console.log(`[CoinGlass] AHR999 = ${ahr999}`);
  }

  // --- STH-SOPR ---
  // 字段: sth_sopr
  let sthSopr: number | null = null;
  if (sthSoprData) {
    const v = Number(sthSoprData.sth_sopr);
    if (!isNaN(v) && v > 0) {
      sthSopr = Math.round(v * 1000) / 1000;
      console.log(`[CoinGlass] STH-SOPR = ${sthSopr}`);
    }
  }

  // --- LTH-SOPR ---
  // 字段: lth_sopr
  let lthSopr: number | null = null;
  if (lthSoprData) {
    const v = Number(lthSoprData.lth_sopr);
    if (!isNaN(v) && v > 0) {
      lthSopr = Math.round(v * 1000) / 1000;
      console.log(`[CoinGlass] LTH-SOPR = ${lthSopr}`);
    }
  }

  // --- LTH Supply Percent ---
  // 字段: long_term_holder_supply
  let lthSupplyPercent: number | null = null;
  if (lthSupplyData) {
    const supply = Number(lthSupplyData.long_term_holder_supply);
    if (!isNaN(supply) && supply > 0) {
      lthSupplyPercent =
        Math.round((supply / BTC_APPROX_CIRCULATING) * 1000) / 10;
      console.log(
        `[CoinGlass] LTH Supply = ${supply.toLocaleString()} BTC (${lthSupplyPercent}%)`
      );
    }
  }

  // --- 200 WMA ---
  // 字段: moving_average_1440 (200周均线), price (当前价格)
  let wma200Price: number | null = null;
  let wma200Multiplier: number | null = null;
  if (wma200Data) {
    const wma = Number(wma200Data.moving_average_1440);
    const price = Number(wma200Data.price);
    if (!isNaN(wma) && wma > 0) {
      wma200Price = Math.round(wma);
      if (!isNaN(price) && price > 0) {
        wma200Multiplier = Math.round((price / wma) * 100) / 100;
      }
      console.log(
        `[CoinGlass] 200WMA = $${wma200Price.toLocaleString()}, Price = $${price.toLocaleString()}, Multiplier = ${wma200Multiplier}`
      );
    }
  }

  // --- NUPL ---
  // 字段: nupl 或 net_unrealized_profit_loss
  let nupl: number | null = null;
  if (nuplData) {
    const v = Number(nuplData.net_unpnl ?? nuplData.nupl ?? nuplData.net_unrealized_profit_loss ?? nuplData.value);
    if (!isNaN(v)) {
      nupl = Math.round(v * 1000) / 1000;
      console.log(`[CoinGlass] NUPL = ${nupl}`);
    }
  }

  // --- LTH-MVRV ---
  // 通过 bitcoin-lth-realized-price 端点: LTH-MVRV = price / lth_realized_price
  let lthMvrv: number | null = null;
  if (lthRealizedData) {
    const price = Number(lthRealizedData.price);
    const realizedPrice = Number(lthRealizedData.lth_realized_price);
    if (!isNaN(price) && price > 0 && !isNaN(realizedPrice) && realizedPrice > 0) {
      lthMvrv = Math.round((price / realizedPrice) * 100) / 100;
      console.log(`[CoinGlass] LTH-MVRV = ${lthMvrv} (Price $${Math.round(price).toLocaleString()} / Realized $${Math.round(realizedPrice).toLocaleString()})`);
    }
  }

  const longShortRatio = longShortHistory.at(-1)?.ratio ?? null;
  return { ahr999, sthSopr, lthSopr, lthSupplyPercent, wma200Price, wma200Multiplier, nupl, lthMvrv, etfFlowUsd, etfFlowDays, fundingRate, longShortRatio, longShortHistory };
}

/** 获取 BTC 技术指标 */
export async function fetchBTCMetrics(): Promise<BTCMetrics> {
  const defaultMetrics: BTCMetrics = {
    ahr999: null,
    weeklyRsi: null,
    volume24h: null,
    volumeChangePercent: null,
    sthSopr: null,
    lthSopr: null,
    lthSupplyPercent: null,
    wma200Price: null,
    wma200Multiplier: null,
    ma120Price: null,
    ma200Price: null,
    ema300WeekPrice: null,
    nupl: null,
    lthMvrv: null,
    ma365Price: null,
    ma365Ratio: null,
    etfFlowUsd: null,
    etfFlowDays: [],
    fundingRate: null,
    longShortRatio: null,
    longShortHistory: [],
  };

  try {
    const coinglassKey = process.env.COINGLASS_API_KEY;

    const [weeklyCandles, dailyCandles, onChain] = await Promise.all([
      fetchBTCCandles("1Wutc").catch((err) => {
        console.error("获取 BTC 周线历史出错:", err);
        return [];
      }),
      fetchBTCCandles("1Dutc").catch((err) => {
        console.error("获取 BTC 日线历史出错:", err);
        return [];
      }),
      coinglassKey
        ? fetchOnChainMetrics(coinglassKey)
        : Promise.resolve({
            ahr999: null,
            sthSopr: null,
            lthSopr: null,
            lthSupplyPercent: null,
            wma200Price: null,
            wma200Multiplier: null,
            ma120Price: null,
            ma200Price: null,
            ema300WeekPrice: null,
            nupl: null,
            lthMvrv: null,
            ma365Price: null,
            ma365Ratio: null,
            etfFlowUsd: null,
            etfFlowDays: [] as number[],
            fundingRate: null,
            longShortRatio: null,
            longShortHistory: [],
          }),
    ]);

    if (!coinglassKey) {
      console.log("[CoinGlass] 未设置 COINGLASS_API_KEY，跳过链上指标获取");
    }

    // --- 周线 RSI ---
    const weeklyCloses = weeklyCandles.map(c => Number(c[4])).filter(close => Number.isFinite(close) && close > 0);
    const weeklyRsi = calculateRSI(weeklyCloses, 14);
    const ema300Week = calculateEMA(weeklyCloses, 300);
    const ema300WeekPrice = ema300Week === null ? null : Math.round(ema300Week);

    if (ema300WeekPrice !== null) {
      console.log(
        `[OKX] 300W EMA = $${ema300WeekPrice.toLocaleString()} (${weeklyCloses.length} weeks)`
      );
    }

    // --- 成交量分析 ---
    let volume24h: number | null = null;
    let volumeChangePercent: number | null = null;
    const volumes = dailyCandles.map(c => Number.parseFloat(c[7]));
    if (volumes.length) {
      volume24h = volumes[volumes.length - 1];
      if (volumes.length >= 30) {
        const last30 = volumes.slice(-30);
        const avg30d = last30.reduce((a, b) => a + b, 0) / last30.length;
        if (avg30d > 0) volumeChangePercent = Math.round(((volume24h - avg30d) / avg30d) * 1000) / 10;
      }
    }

    return {
      ...onChain,
      weeklyRsi,
      volume24h,
      volumeChangePercent,
      ...dailyAverages(dailyCandles),
      ema300WeekPrice,
    };
  } catch (err) {
    console.error("获取 BTC metrics 出错:", err);
    return defaultMetrics;
  }
}
