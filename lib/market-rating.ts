// ========== 抄底/逃顶 综合评级系统 ==========
// 根据各指标权重计算加权综合得分
// 得分 0-100: 0=极度恐慌(抄底机会), 100=极度贪婪(逃顶信号)

import { BTCMetrics, IndicatorScore, MarketRating } from "./types";

/**
 * 将原始指标值映射为 0-100 标准化分数
 * 0 = 极度看跌/恐慌（适合抄底）
 * 100 = 极度看涨/贪婪（适合逃顶）
 *
 * 每个指标的映射逻辑基于历史经验阈值
 */
function normalizeIndicator(name: string, value: number): number {
  // clamp helper
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  switch (name) {
    // ===== 每日关注 =====

    // ETF 每日净流入 (USD): 大量流入=贪婪, 大量流出=恐慌
    // 范围参考: -500M ~ +1B
    case "etfFlowUsd": {
      // 以亿美元为单位
      const flowM = value / 1e6; // 转为百万
      // -500M → 0, 0 → 50, +500M → 83, +1B → 100
      return clamp(50 + (flowM / 500) * 33);
    }

    // Funding Rate: 高正值=极度贪婪, 负值=恐慌
    // 范围参考: -0.05% ~ +0.15% (以小数表示: -0.0005 ~ 0.0015)
    case "fundingRate": {
      // 中性: ~0.01% (0.0001)
      // value 已经是小数，如 0.0001 = 0.01%
      const pct = value * 100; // 转为百分比
      // -0.05% → 0, 0.01% → 50, 0.05% → 75, 0.1%+ → 100
      return clamp(50 + (pct - 0.01) * 500);
    }

    // 多空比: >1表示多头占优=偏贪婪, <1表示空头占优=偏恐慌
    // 范围参考: 0.8 ~ 2.0
    case "longShortRatio": {
      // 1.0 → 40(偏恐慌), 1.2 → 55, 1.5 → 70, 2.0 → 100
      return clamp((value - 0.5) * 66.7);
    }

    // 恐惧贪婪指数: 直接就是 0-100
    case "fearGreed": {
      return clamp(value);
    }

    // ===== 每周关注 =====

    // LTH-MVRV: <1=严重低估(抄底), 1.5=中性, >3.5=严重高估(逃顶)
    case "lthMvrv": {
      // 0.5 → 0, 1.0 → 20, 1.5 → 40, 2.0 → 55, 3.0 → 80, 3.5+ → 100
      return clamp((value - 0.5) * 33.3);
    }

    // NUPL: <0=恐慌(抄底), 0.25=乐观, 0.5=信仰, 0.75=贪婪(逃顶)
    case "nupl": {
      // -0.2 → 0, 0 → 25, 0.25 → 50, 0.5 → 75, 0.75 → 100
      return clamp((value + 0.25) * 100);
    }

    // LTH-SOPR: <1=亏损抛售(恐慌), =1=盈亏平衡, >1=获利抛售
    // 范围: 0.5 ~ 5+
    case "lthSopr": {
      // 0.5 → 0, 1.0 → 25, 2.0 → 50, 4.0 → 90, 5.0 → 100
      return clamp((value - 0.5) * 22.2);
    }

    // STH-SOPR: <1=短期亏损(恐慌), >1=短期获利(贪婪)
    // 范围: 0.95 ~ 1.05
    case "sthSopr": {
      // 0.95 → 0, 1.0 → 50, 1.03 → 80, 1.05 → 100
      return clamp((value - 0.95) * 1000);
    }

    // LTH 持有者占比(%): 高占比=累积/低估, 低占比=分配/高估
    // 范围: 55% ~ 75% (注意这是反向指标: 高占比=抄底)
    case "lthSupplyPercent": {
      // 75% → 0 (LTH大量持有=底部), 65% → 50, 55% → 100 (LTH大量分配=顶部)
      return clamp((75 - value) * 5);
    }

    // 365日均线倍数: <0.7=严重低估, 1.0=中性, >2.0=高估
    case "ma365Ratio": {
      // 0.5 → 0, 0.8 → 20, 1.0 → 33, 1.5 → 67, 2.0 → 100
      return clamp((value - 0.5) * 66.7);
    }

    // 200周均线倍数: <1.0=低估(抄底), 2.0=中性偏高, >3.5=严重高估(逃顶)
    case "wma200Multiplier": {
      // 0.5 → 0, 1.0 → 17, 2.0 → 50, 3.0 → 83, 3.5 → 100
      return clamp((value - 0.5) * 33.3);
    }

    // 周线 RSI: <30=超卖(抄底), 50=中性, >70=超买(逃顶)
    case "weeklyRsi": {
      // 20 → 0, 30 → 17, 50 → 50, 70 → 83, 80 → 100
      return clamp((value - 20) * (100 / 60));
    }

    // 成交量变化(%): 大幅放量可能是顶/底，需结合趋势
    // 但一般牛市末期放量 → 贪婪
    // 范围: -50% ~ +200%
    case "volumeChangePercent": {
      // -50% → 20, 0% → 45, +50% → 60, +100% → 75, +200% → 100
      return clamp(45 + value * 0.275);
    }

    default:
      return 50; // 未知指标给中性分
  }
}

/**
 * 计算综合抄底/逃顶评级
 *
 * 权重分组:
 * 每日关注 (总权重 32):
 *   - ETF 每日净流入: 12
 *   - Funding Rate: 8
 *   - 多空比: 5
 *   - 恐惧贪婪指数: 7
 *
 * 每周关注 (总权重 68):
 *   - LTH-MVRV: 10
 *   - NUPL: 9
 *   - LTH-SOPR: 8
 *   - STH-SOPR: 7
 *   - LTH持有者占比: 6
 *   - 365日均线倍数: 6
 *   - 200周均线倍数: 6
 *   - 周线 RSI: 5
 *   - 成交量变化: 3
 */
export function calculateMarketRating(
  btcMetrics: BTCMetrics,
  fearGreed: number | null
): MarketRating {
  const indicatorConfigs: Array<{
    name: string;
    label: string;
    value: number | null;
    weight: number;
    group: "daily" | "weekly";
    category: string;
  }> = [
    // 每日关注 — 机构资金流 / 衍生品
    { name: "etfFlowUsd", label: "ETF 每日净流入", value: btcMetrics.etfFlowUsd, weight: 12, group: "daily", category: "机构资金流/衍生品" },
    { name: "fundingRate", label: "Funding Rate", value: btcMetrics.fundingRate, weight: 8, group: "daily", category: "机构资金流/衍生品" },
    { name: "longShortRatio", label: "多空比", value: btcMetrics.longShortRatio, weight: 5, group: "daily", category: "机构资金流/衍生品" },
    // 每日关注 — 宏观情绪
    { name: "fearGreed", label: "恐惧贪婪指数", value: fearGreed, weight: 7, group: "daily", category: "宏观情绪" },

    // 每周关注 — 链上基本面
    { name: "lthMvrv", label: "LTH-MVRV", value: btcMetrics.lthMvrv, weight: 10, group: "weekly", category: "链上基本面" },
    { name: "nupl", label: "NUPL", value: btcMetrics.nupl, weight: 9, group: "weekly", category: "链上基本面" },
    { name: "lthSopr", label: "LTH-SOPR", value: btcMetrics.lthSopr, weight: 8, group: "weekly", category: "链上基本面" },
    { name: "sthSopr", label: "STH-SOPR", value: btcMetrics.sthSopr, weight: 7, group: "weekly", category: "链上基本面" },
    { name: "lthSupplyPercent", label: "LTH 持有者占比", value: btcMetrics.lthSupplyPercent, weight: 6, group: "weekly", category: "链上基本面" },

    // 每周关注 — 技术动能
    { name: "ma365Ratio", label: "365日均线倍数", value: btcMetrics.ma365Ratio, weight: 6, group: "weekly", category: "技术动能" },
    { name: "wma200Multiplier", label: "200周均线倍数", value: btcMetrics.wma200Multiplier, weight: 6, group: "weekly", category: "技术动能" },
    { name: "weeklyRsi", label: "周线 RSI", value: btcMetrics.weeklyRsi, weight: 5, group: "weekly", category: "技术动能" },
    { name: "volumeChangePercent", label: "成交量变化", value: btcMetrics.volumeChangePercent, weight: 3, group: "weekly", category: "技术动能" },
  ];

  const indicators: IndicatorScore[] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let dailyWeightedScore = 0;
  let dailyWeight = 0;
  let weeklyWeightedScore = 0;
  let weeklyWeight = 0;

  for (const cfg of indicatorConfigs) {
    const score = cfg.value !== null && cfg.value !== undefined
      ? normalizeIndicator(cfg.name, cfg.value)
      : -1; // -1 表示无数据

    indicators.push({
      name: cfg.label,
      value: cfg.value,
      score: score >= 0 ? score : 0,
      weight: cfg.weight,
      group: cfg.group,
      category: cfg.category,
    });

    // 只有有数据的指标才参与加权
    if (score >= 0) {
      totalWeightedScore += score * cfg.weight;
      totalWeight += cfg.weight;
      if (cfg.group === "daily") {
        dailyWeightedScore += score * cfg.weight;
        dailyWeight += cfg.weight;
      } else {
        weeklyWeightedScore += score * cfg.weight;
        weeklyWeight += cfg.weight;
      }
    }
  }

  const totalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;
  const dailyScore = dailyWeight > 0 ? Math.round(dailyWeightedScore / dailyWeight) : 50;
  const weeklyScore = weeklyWeight > 0 ? Math.round(weeklyWeightedScore / weeklyWeight) : 50;

  // 根据得分确定评级标签和建议
  let level: string;
  let suggestion: string;

  if (totalScore <= 15) {
    level = "极度恐慌";
    suggestion = "历史级别抄底机会，可考虑重仓建仓";
  } else if (totalScore <= 30) {
    level = "恐慌";
    suggestion = "市场低估，适合分批建仓或加仓";
  } else if (totalScore <= 45) {
    level = "偏恐慌";
    suggestion = "市场偏冷，可适度布局";
  } else if (totalScore <= 55) {
    level = "中性";
    suggestion = "市场情绪平衡，保持现有仓位观望";
  } else if (totalScore <= 70) {
    level = "偏贪婪";
    suggestion = "市场偏热，注意控制风险，可适度减仓";
  } else if (totalScore <= 85) {
    level = "贪婪";
    suggestion = "市场过热，建议逐步止盈减仓";
  } else {
    level = "极度贪婪";
    suggestion = "逃顶信号强烈，建议大幅减仓或清仓";
  }

  return {
    totalScore,
    dailyScore,
    weeklyScore,
    level,
    suggestion,
    indicators,
  };
}
