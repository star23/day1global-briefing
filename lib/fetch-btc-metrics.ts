// ========== 获取 BTC 链上/技术指标 ==========
// 从 OKX 获取 K 线数据计算周线 RSI 和成交量变化

export interface BTCMetrics {
  weeklyRsi: number | null;           // 14 周期周线 RSI
  volume24h: number | null;           // 24小时成交量 (USD)
  volumeChangePercent: number | null; // 成交量 vs 30日均量 变化百分比
  mvrv: number | null;                // MVRV 比率（需链上数据源）
  lthSupplyPercent: number | null;    // 长期持有者供应占比（需链上数据源）
}

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
    // 并发获取周线和日线 K 线数据
    const [weeklyRes, dailyRes] = await Promise.all([
      // 周线 K 线（最近 30 根，用于计算 14 周期 RSI）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1W&limit=30"
      ),
      // 日线 K 线（最近 31 根，用于成交量分析）
      fetch(
        "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=31"
      ),
    ]);

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
      mvrv: null, // 需要 Glassnode/CryptoQuant 等链上数据源
      lthSupplyPercent: null, // 需要 Glassnode 等链上数据源
    };
  } catch (err) {
    console.error("获取 BTC metrics 出错:", err);
    return defaultMetrics;
  }
}
