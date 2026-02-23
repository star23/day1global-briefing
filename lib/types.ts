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
  cryptoFearGreed: number;        // 恐慌贪婪指数 0-100
  cryptoFearGreedLabel: string;   // 文字标签（如 "Greed", "Fear"）
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
    vix: IndexData;
    gold: IndexData;
  };
  sentiment: SentimentData;
}

/** AI 生成的每日市场分析（由 Claude 生成，存储在 Vercel KV） */
export interface AIAnalysis {
  macroAnalysis: string;      // 宏观判断
  cryptoAnalysis: string;     // 加密分析
  actionSuggestions: string;  // 操作建议
  generatedAt: string;        // 生成时间（ISO 格式）
  dataTimestamp: string;      // 基于的市场数据时间戳
}
