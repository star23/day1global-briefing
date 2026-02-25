// ========== 获取 BTC 链上/技术指标 ==========
// 从 OKX 获取 K 线数据计算周线 RSI 和成交量变化
// 从 CoinGlass 获取 STH-SOPR / LTH-SOPR / LTH Supply / 200WMA

export interface BTCMetrics {
  weeklyRsi: number | null;           // 14 周期周线 RSI
  volume24h: number | null;           // 24小时成交量 (USD)
  volumeChangePercent: number | null; // 成交量 vs 30日均量 变化百分比
  sthSopr: number | null;             // 短期持有者已实现利润率
  lthSopr: number | null;             // 长期持有者已实现利润率
  lthSupplyPercent: number | null;    // 长期持有者供应占比（%）
  wma200Price: number | null;         // 200 周均线价格
  wma200Multiplier: number | null;    // 当前价格 / 200WMA 倍数
}

// BTC 大致流通量（约 19.85M，每天增加约 450 BTC，误差 <0.1%）
const BTC_APPROX_CIRCULATING = 19_850_000;

/** CoinGlass API V4 基础 URL */
const COINGLASS_BASE = "https://open-api-v4.coinglass.com";

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

/** 从 CoinGlass 获取单个端点的最新数据记录 */
async function fetchCoinGlassLatest(
  apiKey: string,
  endpoint: string,
  label: string
): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`${COINGLASS_BASE}/api/index/${endpoint}`, {
      headers: { "CG-API-KEY": apiKey, accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[CoinGlass] ${label} 请求失败: ${res.status}`);
      return null;
    }
    const json = await res.json();
    // DEBUG: 输出完整响应结构
    console.log(`[CoinGlass] ${label} 响应:`, JSON.stringify({
      code: json.code,
      msg: json.msg,
      dataType: Array.isArray(json.data) ? "array" : typeof json.data,
      dataLength: Array.isArray(json.data) ? json.data.length : undefined,
      firstItem: Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : undefined,
      lastItem: Array.isArray(json.data) && json.data.length > 0 ? json.data[json.data.length - 1] : undefined,
      rawDataPreview: !Array.isArray(json.data) ? json.data : undefined,
    }));
    if (json.code !== "0" || !json.data) {
      console.error(`[CoinGlass] ${label} 数据异常:`, json.msg || "无数据");
      return null;
    }
    // data 可能是数组或对象
    if (Array.isArray(json.data)) {
      if (json.data.length === 0) {
        console.error(`[CoinGlass] ${label} 数据为空数组`);
        return null;
      }
      return json.data[json.data.length - 1];
    }
    // 如果 data 直接就是对象
    if (typeof json.data === "object") {
      return json.data;
    }
    return null;
  } catch (err) {
    console.error(`[CoinGlass] 获取 ${label} 出错:`, err);
    return null;
  }
}

/** 从 CoinGlass 获取链上指标：STH-SOPR、LTH-SOPR、LTH Supply%、200WMA */
async function fetchOnChainMetrics(apiKey: string): Promise<{
  sthSopr: number | null;
  lthSopr: number | null;
  lthSupplyPercent: number | null;
  wma200Price: number | null;
  wma200Multiplier: number | null;
}> {
  const [sthSoprData, lthSoprData, lthSupplyData, wma200Data] =
    await Promise.all([
      fetchCoinGlassLatest(apiKey, "bitcoin-sth-sopr", "STH-SOPR"),
      fetchCoinGlassLatest(apiKey, "bitcoin-lth-sopr", "LTH-SOPR"),
      fetchCoinGlassLatest(apiKey, "bitcoin-long-term-holder-supply", "LTH Supply"),
      fetchCoinGlassLatest(apiKey, "200-week-moving-average-heatmap", "200WMA"),
    ]);

  // --- STH-SOPR ---
  let sthSopr: number | null = null;
  if (sthSoprData) {
    console.log("[CoinGlass] STH-SOPR 原始数据:", JSON.stringify(sthSoprData));
    // 尝试多种可能的字段名
    const v = Number(
      sthSoprData.sopr ?? sthSoprData.value ?? sthSoprData.sth_sopr ??
      sthSoprData.STH_SOPR ?? sthSoprData.ratio
    );
    if (!isNaN(v) && v > 0) {
      sthSopr = Math.round(v * 1000) / 1000;
      console.log(`[CoinGlass] STH-SOPR = ${sthSopr}`);
    } else {
      console.error(`[CoinGlass] STH-SOPR 无法解析值, v=${v}`);
    }
  }

  // --- LTH-SOPR ---
  let lthSopr: number | null = null;
  if (lthSoprData) {
    console.log("[CoinGlass] LTH-SOPR 原始数据:", JSON.stringify(lthSoprData));
    const v = Number(
      lthSoprData.sopr ?? lthSoprData.value ?? lthSoprData.lth_sopr ??
      lthSoprData.LTH_SOPR ?? lthSoprData.ratio
    );
    if (!isNaN(v) && v > 0) {
      lthSopr = Math.round(v * 1000) / 1000;
      console.log(`[CoinGlass] LTH-SOPR = ${lthSopr}`);
    } else {
      console.error(`[CoinGlass] LTH-SOPR 无法解析值, v=${v}`);
    }
  }

  // --- LTH Supply Percent ---
  let lthSupplyPercent: number | null = null;
  if (lthSupplyData) {
    const supply = Number(
      lthSupplyData.long_term_holder_supply ?? lthSupplyData.supply
    );
    if (!isNaN(supply) && supply > 0) {
      lthSupplyPercent =
        Math.round((supply / BTC_APPROX_CIRCULATING) * 1000) / 10;
      console.log(
        `[CoinGlass] LTH Supply = ${supply.toLocaleString()} BTC (${lthSupplyPercent}%)`
      );
    }
  }

  // --- 200 WMA ---
  let wma200Price: number | null = null;
  let wma200Multiplier: number | null = null;
  if (wma200Data) {
    // 先 log 一下返回的字段，方便调试
    console.log("[CoinGlass] 200WMA 原始数据字段:", Object.keys(wma200Data));
    const wma = Number(
      wma200Data.ma200 ??
        wma200Data.moving_average ??
        wma200Data.wma200 ??
        wma200Data.ma ??
        wma200Data.value
    );
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

  return { sthSopr, lthSopr, lthSupplyPercent, wma200Price, wma200Multiplier };
}

/** 获取 BTC 技术指标 */
export async function fetchBTCMetrics(): Promise<BTCMetrics> {
  const defaultMetrics: BTCMetrics = {
    weeklyRsi: null,
    volume24h: null,
    volumeChangePercent: null,
    sthSopr: null,
    lthSopr: null,
    lthSupplyPercent: null,
    wma200Price: null,
    wma200Multiplier: null,
  };

  try {
    const coinglassKey = process.env.COINGLASS_API_KEY;

    const [weeklyRes, dailyRes, onChain] = await Promise.all([
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1W&limit=30"
      ),
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=31"
      ),
      coinglassKey
        ? fetchOnChainMetrics(coinglassKey)
        : Promise.resolve({
            sthSopr: null,
            lthSopr: null,
            lthSupplyPercent: null,
            wma200Price: null,
            wma200Multiplier: null,
          }),
    ]);

    if (!coinglassKey) {
      console.log("[CoinGlass] 未设置 COINGLASS_API_KEY，跳过链上指标获取");
    }

    // --- 周线 RSI ---
    let weeklyRsi: number | null = null;
    if (weeklyRes.ok) {
      const weeklyData = await weeklyRes.json();
      if (weeklyData.code === "0" && weeklyData.data?.length > 0) {
        const weeklyCloses = weeklyData.data
          .reverse()
          .map((candle: string[]) => parseFloat(candle[4]));
        weeklyRsi = calculateRSI(weeklyCloses, 14);
      }
    }

    // --- 成交量分析 ---
    let volume24h: number | null = null;
    let volumeChangePercent: number | null = null;
    if (dailyRes.ok) {
      const dailyData = await dailyRes.json();
      if (dailyData.code === "0" && dailyData.data?.length > 0) {
        const volumes = dailyData.data
          .reverse()
          .map((candle: string[]) => parseFloat(candle[7]));

        volume24h = volumes[volumes.length - 1];

        if (volumes.length >= 30) {
          const last30 = volumes.slice(-30);
          const avg30d =
            last30.reduce((a: number, b: number) => a + b, 0) / last30.length;
          if (avg30d > 0 && volume24h !== null) {
            volumeChangePercent =
              Math.round(((volume24h - avg30d) / avg30d) * 100 * 10) / 10;
          }
        }
      }
    }

    return {
      weeklyRsi,
      volume24h,
      volumeChangePercent,
      ...onChain,
    };
  } catch (err) {
    console.error("获取 BTC metrics 出错:", err);
    return defaultMetrics;
  }
}
