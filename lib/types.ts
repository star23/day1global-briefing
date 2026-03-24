// ========== 类型定义文件 ==========
// 定义所有数据结构的 TypeScript 接口

/** 单只股票的数据 */
export interface StockData {
  price: number;           // 当前价格
  changePercent: number;   // 涨跌幅百分比
  marketState: "pre" | "regular" | "post" | "closed"; // 市场状态：盘前/盘中/盘后/休市
}

/** 单个加密货币的数据 */
export interface CryptoData {
  price: number;           // 当前价格（美元）
  change24h: number;       // 24小时涨跌幅百分比
}

/** 指数数据（标普500/VIX/黄金） */
export interface IndexData {
  price: number;           // 当前价格
  changePercent: number;   // 涨跌幅百分比
}

/** 市场情绪数据 */
export interface SentimentData {
  cryptoFearGreed: number;           // 加密恐慌贪婪指数 0-100
  cryptoFearGreedLabel: string;      // 文字标签（如 "Greed", "Fear"）
  cryptoFearGreedPrev: number | null;   // 昨日恐慌贪婪指数
  cryptoFearGreedChange: number | null; // 今日 - 昨日 变化
  cnnFearGreed: number | null;       // CNN 恐惧贪婪指数 0-100（美股情绪）
  cnnFearGreedLabel: string | null;  // CNN 文字标签
}

/** BTC 技术/链上指标 */
export interface BTCMetrics {
  weeklyRsi: number | null;           // 14 周期周线 RSI
  volume24h: number | null;           // 24小时成交量 (USD)
  volumeChangePercent: number | null; // 成交量 vs 30日均量 变化百分比
  sthSopr: number | null;             // STH-SOPR 短期持有者已实现利润率
  lthSopr: number | null;             // LTH-SOPR 长期持有者已实现利润率
  lthSupplyPercent: number | null;    // 长期持有者供应占比
  wma200Price: number | null;         // 200 周均线价格
  wma200Multiplier: number | null;    // 当前价格 / 200WMA 倍数
  nupl: number | null;                // NUPL 全网未实现净盈亏比率
  lthMvrv: number | null;             // LTH-MVRV 长期持有者市场价值/已实现价值
  ma365Price: number | null;          // BTC 365日均线价格
  ma365Ratio: number | null;          // 当前价格 / 365日均线 倍数
  etfFlowUsd: number | null;          // BTC ETF 每日净流入（美元）
  etfFlowDays: number[];              // ETF 最近 6 日净流入数组（从最新到最旧）
  fundingRate: number | null;         // BTC 资金费率（Binance 8h）
  longShortRatio: number | null;      // 全球多空账户比
}

/** /api/market-data 返回的完整数据格式 */
export interface MarketDataResponse {
  timestamp: string;       // ISO 格式时间戳
  stocks: {
    [ticker: string]: StockData;
  };
  crypto: {
    [ticker: string]: CryptoData;
  };
  indices: {
    sp500: IndexData;
    vix: IndexData;
    gold: IndexData;
    crudeOil: IndexData;
    dxy: IndexData;
  };
  sentiment: SentimentData;
  btcMetrics: BTCMetrics;  // BTC 技术指标
}

/** AI 精选的单条新闻 */
export interface NewsItem {
  title: string;       // 中文标题/摘要
  tag: string;         // 分类标签（宏观/加密/财报/政策/避险 等）
  summary: string;     // 一句话中文说明
  action: string;      // 操作建议
  source: string;      // 来源名称
  url: string;         // 原文链接
}

/** BTC 指标历史快照（存储在 Postgres） */
export interface MetricsSnapshot {
  date: string;              // YYYY-MM-DD
  btcPrice: number | null;
  weeklyRsi: number | null;
  volume24h: number | null;
  volumeChangePct: number | null;
  sthSopr: number | null;
  lthSopr: number | null;
  lthSupplyPct: number | null;
  wma200Price: number | null;
  wma200Multiplier: number | null;
  fearGreed: number | null;
  nupl: number | null;
  lthMvrv: number | null;
  ma365Price: number | null;
  ma365Ratio: number | null;
  etfFlowUsd: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
}

/**
 * 指标评分系统 — 抄底/逃顶综合评级
 * 每个指标有独立的权重，分为"每日关注"和"每周关注"两组
 */
export interface IndicatorScore {
  name: string;           // 指标名称
  value: number | null;   // 当前值
  score: number;          // 标准化分数 0-100 (0=极度恐慌/抄底, 100=极度贪婪/逃顶)
  weight: number;         // 权重
  group: 'daily' | 'weekly'; // 分组
  category: string;       // 子分类
}

export interface MarketRating {
  totalScore: number;          // 加权综合得分 0-100
  dailyScore: number;          // 每日关注得分
  weeklyScore: number;         // 每周关注得分
  level: string;               // 评级标签（极度恐慌/恐慌/中性/贪婪/极度贪婪）
  suggestion: string;          // 操作建议
  indicators: IndicatorScore[]; // 各指标明细
}

/** /api/metrics-history 返回的历史对比数据 */
export interface MetricsHistoryResponse {
  yesterday: MetricsSnapshot | null;
  oneWeek: MetricsSnapshot | null;
  oneMonth: MetricsSnapshot | null;
}

/** AI 生成的每日市场分析（由 Claude 生成，存储在 Vercel KV） */
export interface AIAnalysis {
  macroAnalysis: string;      // 宏观判断
  cryptoAnalysis: string;     // 加密分析
  actionSuggestions: string;  // 操作建议
  topNews: NewsItem[];        // 今日必看 10 条新闻
  iranCeasefire: string;      // 美国-伊朗停火进展分析
  hormuzStrait: string;       // 霍尔木兹海峡封锁风险分析
  cryptoTopicsAnalysis: string;  // 加密标的动态分析（BTC/ETH/XAUT/HYPE/VIRTUAL/TAO/BNB/SOL）
  stockTopicsAnalysis: string;   // 美股标的动态分析（NVDA/TSLA/GOOG/RKLB/CRCL/HOOD/COIN/TEM/Stripe）
  generatedAt: string;        // 生成时间（ISO 格式）
  dataTimestamp: string;      // 基于的市场数据时间戳
}
