// ========== 获取 BTC 链上/技术指标 ==========
// 从 CoinGecko 获取价格历史计算 RSI 和成交量变化

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

/** 将日线数据重采样为周线（取每周最后一个收盘价） */
function resampleToWeekly(dailyPrices: [number, number][]): number[] {
  if (dailyPrices.length === 0) return [];

  const weeklyCloses: number[] = [];
  let currentWeek = -1;
  let lastPrice = 0;

  for (const [timestamp, price] of dailyPrices) {
    const date = new Date(timestamp);
    // ISO week number
    const oneJan = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(((date.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
    const yearWeek = date.getFullYear() * 100 + week;

    if (yearWeek !== currentWeek && currentWeek !== -1) {
      weeklyCloses.push(lastPrice);
    }
    currentWeek = yearWeek;
    lastPrice = price;
  }
  // 推入最后一周
  weeklyCloses.push(lastPrice);

  return weeklyCloses;
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
    // 获取 150 天日线数据用于计算周线 RSI（需要约 15+ 周数据）
    const url =
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=150&interval=daily";

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`CoinGecko market_chart 请求失败: ${res.status}`);
      return defaultMetrics;
    }

    const data = await res.json();

    // --- 周线 RSI ---
    const weeklyCloses = resampleToWeekly(data.prices || []);
    const weeklyRsi = calculateRSI(weeklyCloses, 14);

    // --- 成交量分析 ---
    const volumes: number[] = (data.total_volumes || []).map(
      (v: [number, number]) => v[1]
    );
    const volume24h = volumes.length > 0 ? volumes[volumes.length - 1] : null;

    let volumeChangePercent: number | null = null;
    if (volumes.length >= 30) {
      const last30 = volumes.slice(-30);
      const avg30d = last30.reduce((a, b) => a + b, 0) / last30.length;
      if (avg30d > 0 && volume24h !== null) {
        volumeChangePercent =
          Math.round(((volume24h - avg30d) / avg30d) * 100 * 10) / 10;
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
