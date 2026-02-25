// ========== 获取 BTC 链上/技术指标 ==========
// 从 OKX 获取 K 线数据计算周线 RSI 和成交量变化
// 从 CoinGlass 获取 SOPR + Supply 数据，计算加权 MVRV 近似值和长期持有者供应占比

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
    if (json.code !== "0" || !json.data || json.data.length === 0) {
      console.error(`[CoinGlass] ${label} 数据异常:`, json.msg || "无数据");
      return null;
    }
    return json.data[json.data.length - 1];
  } catch (err) {
    console.error(`[CoinGlass] 获取 ${label} 出错:`, err);
    return null;
  }
}

/**
 * 从 CoinGlass 获取链上指标，计算 MVRV 和 LTH 供应占比
 *
 * MVRV 计算方式：
 *   Realized Price = (STH_RP × STH_Supply + LTH_RP × LTH_Supply) / (STH_Supply + LTH_Supply)
 *   MVRV = Current Price / Realized Price
 *
 * LTH Supply% = LTH_Supply / (STH_Supply + LTH_Supply) × 100
 */
async function fetchOnChainMetrics(
  apiKey: string
): Promise<{ mvrv: number | null; lthSupplyPercent: number | null }> {
  // 并发请求 4 个端点
  const [sthRPData, lthRPData, sthSupplyData, lthSupplyData] =
    await Promise.all([
      fetchCoinGlassLatest(
        apiKey,
        "bitcoin-sth-sopr",
        "STH Realized Price"
      ),
      fetchCoinGlassLatest(
        apiKey,
        "bitcoin-lth-sopr",
        "LTH Realized Price"
      ),
      fetchCoinGlassLatest(
        apiKey,
        "bitcoin-short-term-holder-supply",
        "STH Supply"
      ),
      fetchCoinGlassLatest(
        apiKey,
        "bitcoin-long-term-holder-supply",
        "LTH Supply"
      ),
    ]);

  let mvrv: number | null = null;
  let lthSupplyPercent: number | null = null;

  // 提取 STH/LTH 供应量
  const sthSupplyVal = sthSupplyData
    ? Number(
        sthSupplyData.short_term_holder_supply ?? sthSupplyData.supply
      )
    : NaN;
  const lthSupplyVal = lthSupplyData
    ? Number(
        lthSupplyData.long_term_holder_supply ?? lthSupplyData.supply
      )
    : NaN;
  const totalSupply =
    !isNaN(sthSupplyVal) && !isNaN(lthSupplyVal)
      ? sthSupplyVal + lthSupplyVal
      : NaN;

  // --- 计算 LTH Supply Percent ---
  if (!isNaN(lthSupplyVal) && lthSupplyVal > 0) {
    const denominator = !isNaN(totalSupply)
      ? totalSupply
      : BTC_APPROX_CIRCULATING;
    lthSupplyPercent =
      Math.round((lthSupplyVal / denominator) * 1000) / 10;
    console.log(
      `[CoinGlass] LTH Supply = ${lthSupplyVal.toLocaleString()} BTC (${lthSupplyPercent}%)`
    );
  }

  // --- 计算 MVRV ---
  // 提取 STH-SOPR / LTH-SOPR（已实现利润率）
  const sthSOPR = sthRPData
    ? Number(sthRPData.sopr ?? sthRPData.value)
    : NaN;
  const lthSOPR = lthRPData
    ? Number(lthRPData.sopr ?? lthRPData.value)
    : NaN;

  // 获取当前价格（从任意端点的 price 字段）
  const currentPrice = Number(
    sthRPData?.price ??
      lthRPData?.price ??
      sthSupplyData?.price ??
      lthSupplyData?.price
  );

  // 用 SOPR 加权近似 MVRV:
  //   整体 SOPR ≈ (STH_SOPR × STH_Supply + LTH_SOPR × LTH_Supply) / Total_Supply
  //   SOPR 反映已花费输出的盈亏比，加权后可作为 MVRV 的近似参考
  if (
    !isNaN(sthSOPR) &&
    !isNaN(lthSOPR) &&
    !isNaN(sthSupplyVal) &&
    !isNaN(lthSupplyVal) &&
    !isNaN(totalSupply) &&
    totalSupply > 0
  ) {
    const weightedSOPR =
      (sthSOPR * sthSupplyVal + lthSOPR * lthSupplyVal) / totalSupply;
    mvrv = Math.round(weightedSOPR * 100) / 100;
    console.log(
      `[CoinGlass] MVRV(加权SOPR) = ${mvrv} (STH_SOPR: ${sthSOPR.toFixed(3)}, LTH_SOPR: ${lthSOPR.toFixed(3)}, Price: $${currentPrice.toLocaleString()})`
    );
  }

  return { mvrv, lthSupplyPercent };
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
    const [weeklyRes, dailyRes, onChainMetrics] = await Promise.all([
      // OKX: 周线 K 线（最近 30 根，用于计算 14 周期 RSI）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1W&limit=30"
      ),
      // OKX: 日线 K 线（最近 31 根，用于成交量分析）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=31"
      ),
      // CoinGlass: MVRV（通过 SOPR + Supply 计算） & LTH Supply%
      coinglassKey
        ? fetchOnChainMetrics(coinglassKey)
        : Promise.resolve({ mvrv: null, lthSupplyPercent: null }),
    ]);
    const { mvrv, lthSupplyPercent } = onChainMetrics;

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
