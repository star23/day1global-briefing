// ========== 获取 BTC 链上/技术指标 ==========
// 从 OKX 获取 K 线数据计算周线 RSI 和成交量变化
// 从 CoinGlass 获取 MVRV 比率和长期持有者供应占比

export interface BTCMetrics {
  weeklyRsi: number | null;           // 14 周期周线 RSI
  volume24h: number | null;           // 24小时成交量 (USD)
  volumeChangePercent: number | null; // 成交量 vs 30日均量 变化百分比
  mvrv: number | null;                // MVRV 比率
  lthSupplyPercent: number | null;    // 长期持有者供应占比（%）
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

  // 使用最近的数据计算
  let avgGain = 0;
  let avgLoss = 0;

  // 初始平均
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // 平滑计算剩余数据
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

/** 从 CoinGlass 获取 MVRV 比率（最新值） */
async function fetchMVRV(apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/index/bitcoin-mvrv`,
      { headers: { "CG-API-KEY": apiKey, accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`[CoinGlass] MVRV 请求失败: ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== "0" || !json.data || json.data.length === 0) {
      console.error("[CoinGlass] MVRV 数据异常:", json.msg || "无数据");
      return null;
    }
    // 取最新一条（数组最后一个或第一个，取决于排序）
    const latest = json.data[json.data.length - 1];
    // 字段可能是 mvrv 或 mvrv_ratio
    const value = latest.mvrv ?? latest.mvrv_ratio ?? null;
    if (value !== null) {
      console.log(`[CoinGlass] MVRV = ${value}`);
      return Math.round(value * 100) / 100;
    }
    return null;
  } catch (err) {
    console.error("[CoinGlass] 获取 MVRV 出错:", err);
    return null;
  }
}

/** 从 CoinGlass 获取长期持有者供应占比（最新值） */
async function fetchLTHSupply(apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/api/index/bitcoin-long-term-holder-supply`,
      { headers: { "CG-API-KEY": apiKey, accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`[CoinGlass] LTH Supply 请求失败: ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.code !== "0" || !json.data || json.data.length === 0) {
      console.error("[CoinGlass] LTH Supply 数据异常:", json.msg || "无数据");
      return null;
    }
    const latest = json.data[json.data.length - 1];
    const supply = latest.long_term_holder_supply ?? null;
    if (supply !== null && supply > 0) {
      const percent = Math.round((supply / BTC_APPROX_CIRCULATING) * 1000) / 10;
      console.log(
        `[CoinGlass] LTH Supply = ${supply.toLocaleString()} BTC (${percent}%)`
      );
      return percent;
    }
    return null;
  } catch (err) {
    console.error("[CoinGlass] 获取 LTH Supply 出错:", err);
    return null;
  }
}

/** 获取 BTC 技术指标 */
export async function fetchBTCMetrics(): Promise<BTCMetrics> {
  const defaultMetrics: BTCMetrics = {
    weeklyRsi: null,
    volume24h: null,
    volumeChangePercent: null,
    mvrv: null,
    lthSupplyPercent: null,
  };

  try {
    const coinglassKey = process.env.COINGLASS_API_KEY;

    // 并发获取所有数据源
    const [weeklyRes, dailyRes, mvrv, lthSupplyPercent] = await Promise.all([
      // OKX: 周线 K 线（最近 30 根，用于计算 14 周期 RSI）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1W&limit=30"
      ),
      // OKX: 日线 K 线（最近 31 根，用于成交量分析）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=31"
      ),
      // CoinGlass: MVRV
      coinglassKey ? fetchMVRV(coinglassKey) : Promise.resolve(null),
      // CoinGlass: LTH Supply
      coinglassKey ? fetchLTHSupply(coinglassKey) : Promise.resolve(null),
    ]);

    if (!coinglassKey) {
      console.log("[CoinGlass] 未设置 COINGLASS_API_KEY，跳过链上指标获取");
    }

    // --- 周线 RSI ---
    let weeklyRsi: number | null = null;
    if (weeklyRes.ok) {
      const weeklyData = await weeklyRes.json();
      if (weeklyData.code === "0" && weeklyData.data?.length > 0) {
        // OKX 返回最新的在前，需要反转为时间正序
        const weeklyCloses = weeklyData.data
          .reverse()
          .map((candle: string[]) => parseFloat(candle[4])); // index 4 = close
        weeklyRsi = calculateRSI(weeklyCloses, 14);
      }
    }

    // --- 成交量分析 ---
    let volume24h: number | null = null;
    let volumeChangePercent: number | null = null;
    if (dailyRes.ok) {
      const dailyData = await dailyRes.json();
      if (dailyData.code === "0" && dailyData.data?.length > 0) {
        // OKX 返回最新的在前，需要反转为时间正序
        // index 7 = volCcyQuote（以 USDT 计价的成交额）
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
      mvrv,
      lthSupplyPercent,
    };
  } catch (err) {
    console.error("获取 BTC metrics 出错:", err);
    return defaultMetrics;
  }
}
