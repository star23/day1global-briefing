"use client";
// ========== 每日投资情报仪表板 ==========
// 标签页：总览、流动性、市场情绪、BTC底部、持仓、新闻

import { useState, ReactNode } from "react";
import useSWR from "swr";
import { MarketDataResponse, StockData, BTCMetrics, AIAnalysis, NewsItem, MetricsHistoryResponse, MetricsSnapshot } from "@/lib/types";

// ---- SWR 数据获取函数 ----
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// ---- 颜色系统 ----
const COLORS = {
  bg: "#0a0e17",
  card: "#111827",
  cardBorder: "#1e293b",
  accent: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  orange: "#f97316",
  purple: "#8b5cf6",
  gold: "#d4a017",
  text: "#e2e8f0",
  muted: "#94a3b8",
  dimBg: "#1e293b",
};

// ---- 辅助函数 ----

function formatPrice(price: number, isCrypto = false): string {
  if (!price && price !== 0) return "N/A";
  if (isCrypto) {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  }
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(change: number): string {
  if (change === null || change === undefined) return "N/A";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

function getChangeColor(change: number): string {
  if (change > 0) return COLORS.green;
  if (change < 0) return COLORS.red;
  return COLORS.muted;
}

function getMarketStateLabel(state: StockData["marketState"]): { text: string; color: string } {
  switch (state) {
    case "pre": return { text: "盘前", color: COLORS.yellow };
    case "regular": return { text: "交易中", color: COLORS.green };
    case "post": return { text: "盘后", color: COLORS.purple };
    default: return { text: "休市", color: "#64748b" };
  }
}

function getFearGreedColor(value: number): string {
  if (value <= 25) return COLORS.red;
  if (value <= 45) return COLORS.yellow;
  if (value <= 55) return COLORS.muted;
  if (value <= 75) return COLORS.green;
  return COLORS.accent;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ---- 标签页定义 ----
const TABS = [
  { id: "overview", label: "总览" },
  { id: "sentiment", label: "市场情绪" },
  { id: "btc-bottom", label: "BTC底部" },
  { id: "portfolio", label: "持仓" },
  { id: "news", label: "新闻" },
];

// ---- 股票/加密元数据 ----
const STOCK_META: Record<string, { name: string; note: string }> = {
  VOO: { name: "S&P 500 ETF", note: "标普500指数ETF，核心配置" },
  QQQM: { name: "Nasdaq 100 ETF", note: "纳指100 ETF，科技股核心" },
  NVDA: { name: "英伟达", note: "AI算力龙头，关注财报与Blackwell出货" },
  TSLA: { name: "特斯拉", note: "Physical AI/机器人叙事" },
  GOOG: { name: "Alphabet", note: "AI搜索+云增长，估值相对合理" },
  RKLB: { name: "Rocket Lab", note: "Neutron火箭进展是关键催化剂" },
  CRCL: { name: "Circle", note: "稳定币龙头，ARK持续加仓" },
  HOOD: { name: "Robinhood", note: "加密+零售交易平台" },
  COIN: { name: "Coinbase", note: "加密交易所龙头" },
  TEM: { name: "Tempus AI", note: "AI医疗诊断平台，精准医疗赛道" },
};

const CRYPTO_META: Record<string, { name: string; note: string }> = {
  BTC: { name: "比特币", note: "数字黄金，关注链上指标与ETF资金流" },
  ETH: { name: "以太坊", note: "智能合约平台，RWA生态持续增长" },
  XAUT: { name: "Tether黄金", note: "避险资产，锚定实物黄金" },
  HYPE: { name: "Hyperliquid", note: "去中心化衍生品协议" },
  VIRTUAL: { name: "Virtuals Protocol", note: "AI Agent叙事，高Beta资产" },
  TAO: { name: "Bittensor", note: "去中心化AI网络，AI+Crypto核心标的" },
  BNB: { name: "币安币", note: "币安生态核心，BNB Chain生态持续扩展" },
  SOL: { name: "Solana", note: "高性能公链，DeFi/NFT/Meme生态活跃" },
};

// ========== UI 组件 ==========

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      style={{
        background: color + "22",
        color: color,
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  icon,
  children,
  accent = COLORS.accent,
}: {
  title?: string;
  icon?: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        borderTop: `3px solid ${accent}`,
      }}
    >
      {title && (
        <h3
          style={{
            color: COLORS.text,
            fontSize: 15,
            fontWeight: 700,
            margin: "0 0 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>} {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function Gauge({
  value,
  max = 100,
  label,
  color,
  format = "num",
}: {
  value: number;
  max?: number;
  label?: string;
  color: string;
  format?: "num" | "pct";
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 10 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>{label}</span>
          <span style={{ color, fontSize: 13, fontWeight: 700 }}>
            {format === "pct" ? `${value}%` : value}
          </span>
        </div>
      )}
      <div style={{ height: 6, background: COLORS.dimBg, borderRadius: 3 }}>
        <div
          style={{
            height: 6,
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.5s",
          }}
        />
      </div>
    </div>
  );
}

function Skeleton({ width, height }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width || "100%",
        height: height || "20px",
        background: "linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        borderRadius: "4px",
      }}
    />
  );
}

function LoadingState() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <Skeleton height="16px" width="40%" />
          <div style={{ height: 12 }} />
          <Skeleton height="32px" />
          <div style={{ height: 8 }} />
          <Skeleton height="14px" width="60%" />
        </Card>
      ))}
    </div>
  );
}

// ========== 主组件 ==========
export default function MorningBriefing() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data, error, isLoading } = useSWR<MarketDataResponse>(
    "/api/market-data",
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: true }
  );

  const { data: analysis } = useSWR<AIAnalysis>(
    "/api/analysis",
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: true }
  );

  const { data: metricsHistory } = useSWR<MetricsHistoryResponse>(
    "/api/metrics-history",
    fetcher,
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false }
  );

  // 动态生成头部 Badge
  const headerBadges: { text: string; color: string }[] = [];
  if (data?.sentiment && data.sentiment.cryptoFearGreed <= 10) {
    headerBadges.push({ text: "🚨 加密极度恐慌", color: COLORS.red });
  } else if (data?.sentiment && data.sentiment.cryptoFearGreed <= 25) {
    headerBadges.push({ text: "⚠️ 加密恐慌", color: COLORS.red });
  }
  if (data?.indices?.gold && data.indices.gold.changePercent > 0.5) {
    headerBadges.push({ text: "🥇 黄金走强", color: COLORS.green });
  }
  if (data?.indices?.vix && data.indices.vix.price > 25) {
    headerBadges.push({ text: "📉 VIX偏高", color: COLORS.yellow });
  }

  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        color: COLORS.text,
        fontFamily: "'Inter','Noto Sans SC',system-ui,sans-serif",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* ---- Header ---- */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          padding: "24px 20px 16px",
          borderBottom: `1px solid ${COLORS.cardBorder}`,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: COLORS.muted,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              <a href="https://day1global.xyz/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Day1Global</a> · Morning Intelligence
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                📡 美股&加密市场看板
              </span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <a href="https://x.com/starzq" target="_blank" rel="noopener noreferrer" title="X (Twitter)" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://t.me/day1global" target="_blank" rel="noopener noreferrer" title="Telegram" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
                <a href="https://www.youtube.com/@Day1Global" target="_blank" rel="noopener noreferrer" title="YouTube" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
                <a href="https://day1global.xyz/" target="_blank" rel="noopener noreferrer" title="Day1Global" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                </a>
              </span>
            </h1>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              日报订阅
              <a href="https://t.me/day1global" target="_blank" rel="noopener noreferrer" title="Telegram 日报订阅" style={{ color: COLORS.muted, display: "inline-flex", alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </a>
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
              {dateStr}
              {data?.timestamp && (
                <span style={{ marginLeft: 12, fontSize: 11, color: "#64748b" }}>
                  更新: {formatTimestamp(data.timestamp)}
                </span>
              )}
            </div>
            {error && (
              <div style={{ fontSize: 12, color: COLORS.red, marginTop: 4 }}>
                数据加载失败，请刷新重试
              </div>
            )}
          </div>
          {headerBadges.length > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {headerBadges.map((b, i) => (
                  <Badge key={i} color={b.color}>{b.text}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ maxWidth: 900, margin: "16px auto 0", display: "flex", gap: 4, overflowX: "auto" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: activeTab === t.id ? COLORS.accent : "transparent",
                color: activeTab === t.id ? "#fff" : COLORS.muted,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Main Content ---- */}
      <div style={{ padding: "16px 16px 40px", maxWidth: 900, margin: "0 auto" }}>
        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab data={data} analysis={analysis} />}
            {activeTab === "sentiment" && <SentimentTab data={data} analysis={analysis} />}
            {activeTab === "btc-bottom" && <BTCBottomTab data={data} analysis={analysis} history={metricsHistory} />}
            {activeTab === "portfolio" && <PortfolioTab data={data} />}
            {activeTab === "news" && <NewsTab analysis={analysis} />}
          </>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "24px 16px", color: "#64748b", fontSize: 12 }}>
        <a href="https://day1global.xyz/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Day1 Global</a> Briefing — 数据来源: Finnhub, Yahoo Finance, OKX, CoinGlass, Claude AI
      </footer>
    </div>
  );
}

// ========== 总览标签页 ==========
function OverviewTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  // 构建市场全景数据
  const indices: { name: string; val: string; chg: string; color: string }[] = [];

  if (data?.stocks?.VOO) {
    indices.push({ name: "VOO (S&P500)", val: `$${formatPrice(data.stocks.VOO.price)}`, chg: formatChange(data.stocks.VOO.changePercent), color: getChangeColor(data.stocks.VOO.changePercent) });
  }
  if (data?.stocks?.QQQM) {
    indices.push({ name: "QQQM (Nasdaq)", val: `$${formatPrice(data.stocks.QQQM.price)}`, chg: formatChange(data.stocks.QQQM.changePercent), color: getChangeColor(data.stocks.QQQM.changePercent) });
  }
  if (data?.indices?.vix) {
    indices.push({ name: "VIX", val: formatPrice(data.indices.vix.price), chg: formatChange(data.indices.vix.changePercent), color: getChangeColor(data.indices.vix.changePercent) });
  }
  if (data?.indices?.gold) {
    indices.push({ name: "Gold", val: `$${formatPrice(data.indices.gold.price)}`, chg: formatChange(data.indices.gold.changePercent), color: getChangeColor(data.indices.gold.changePercent) });
  }
  if (data?.indices?.crudeOil) {
    indices.push({ name: "Crude Oil", val: `$${formatPrice(data.indices.crudeOil.price)}`, chg: formatChange(data.indices.crudeOil.changePercent), color: getChangeColor(data.indices.crudeOil.changePercent) });
  }
  if (data?.indices?.dxy) {
    indices.push({ name: "DXY", val: formatPrice(data.indices.dxy.price), chg: formatChange(data.indices.dxy.changePercent), color: getChangeColor(data.indices.dxy.changePercent) });
  }
  if (data?.crypto?.BTC) {
    indices.push({ name: "BTC", val: `$${formatPrice(data.crypto.BTC.price, true)}`, chg: formatChange(data.crypto.BTC.change24h), color: getChangeColor(data.crypto.BTC.change24h) });
  }
  if (data?.crypto?.ETH) {
    indices.push({ name: "ETH", val: `$${formatPrice(data.crypto.ETH.price, true)}`, chg: formatChange(data.crypto.ETH.change24h), color: getChangeColor(data.crypto.ETH.change24h) });
  }

  // 恐慌贪婪数值
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
  const fearGreedLabel = data?.sentiment?.cryptoFearGreedLabel ?? "中性";
  const fearGreedPrev = data?.sentiment?.cryptoFearGreedPrev;
  const fearGreedChange = data?.sentiment?.cryptoFearGreedChange;

  // 流动性评级 (基于VIX)
  const vixPrice = data?.indices?.vix?.price ?? 20;
  const liquidityRating = vixPrice > 30 ? "🔴 紧张" : vixPrice > 20 ? "🟡 偏紧" : "🟢 正常";

  // 情绪评级
  const sentimentRating = fearGreed <= 10 ? "🔴 极度恐慌" : fearGreed <= 25 ? "🟡 恐慌" : fearGreed <= 45 ? "🟡 中性偏恐慌" : fearGreed <= 55 ? "🟢 中性" : "🟢 偏贪婪";

  // BTC 抄底评级
  const btcBottomRating = fearGreed <= 10 ? "🟢 偏强" : fearGreed <= 25 ? "🟡 中等" : "⚪ 未触发";

  return (
    <>
      <Card title="市场全景" icon="🌍" accent={COLORS.accent}>
        {indices.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {indices.map((i) => (
              <div key={i.name} style={{ background: COLORS.dimBg, borderRadius: 8, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{i.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, marginTop: 2 }}>{i.val}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: i.color }}>{i.chg}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: COLORS.muted }}>数据加载中...</p>
        )}
      </Card>

      {/* 四框架摘要 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="流动性评级" icon="💧" accent={COLORS.yellow}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.yellow }}>{liquidityRating}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>基于 VIX 与宏观环境</div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, textAlign: "left" }}>
              关注美联储缩表节奏、ON RRP余额、SOFR利率与MOVE指数变化
            </div>
          </div>
        </Card>
        <Card title="市场情绪" icon="🎯" accent={COLORS.yellow}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: getFearGreedColor(fearGreed) }}>{sentimentRating}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
              加密恐慌贪婪: {fearGreed} ({fearGreedLabel})
              {fearGreedChange !== null && fearGreedChange !== undefined && (
                <span style={{ color: fearGreedChange > 0 ? COLORS.green : fearGreedChange < 0 ? COLORS.red : COLORS.muted, marginLeft: 4 }}>
                  {fearGreedChange > 0 ? "+" : ""}{fearGreedChange}
                </span>
              )}
              {fearGreedPrev !== null && fearGreedPrev !== undefined && (
                <span style={{ color: COLORS.muted, marginLeft: 4 }}>
                  (昨日 {fearGreedPrev})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, textAlign: "left" }}>
              {fearGreed <= 25
                ? "加密市场处于极度恐慌区域，历史上是中长期反向买入信号"
                : fearGreed <= 45
                ? "市场情绪偏恐慌，密切关注支撑位，谨慎加仓"
                : "市场情绪中性，等待催化剂明确方向"}
            </div>
          </div>
        </Card>
        <Card title="BTC抄底信号" icon="🔍" accent={COLORS.orange}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.orange }}>{btcBottomRating}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
              恐慌指数={fearGreed} | BTC: {data?.crypto?.BTC ? `$${formatPrice(data.crypto.BTC.price, true)}` : "加载中"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, textAlign: "left" }}>
              {fearGreed <= 10
                ? "恐慌指数触及极端水平✅; 建议分批试探性建仓"
                : fearGreed <= 25
                ? "恐慌指数偏低🟡; 关注链上指标确认底部"
                : "指标未到极端区域，耐心等待机会"}
            </div>
          </div>
        </Card>
        <Card title="关键催化剂" icon="⚡" accent={COLORS.purple}>
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
            <div><Badge color={COLORS.accent}>持续</Badge> 关注美联储政策动向与经济数据</div>
            <div style={{ marginTop: 6 }}><Badge color={COLORS.yellow}>本周</Badge> 重要财报与宏观数据发布</div>
            <div style={{ marginTop: 6 }}><Badge color={COLORS.purple}>地缘</Badge> 关注国际局势对市场情绪影响</div>
            <div style={{ marginTop: 6 }}><Badge color={COLORS.red}>加密</Badge> 链上数据与ETF资金流变化</div>
          </div>
        </Card>
      </div>

      {/* 今日核心判断 */}
      <Card title="今日核心判断" icon="🧠" accent={COLORS.purple}>
        {analysis ? (
          <div style={{ fontSize: 13, lineHeight: 1.9, color: COLORS.muted }}>
            {analysis.macroAnalysis && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: COLORS.text }}>宏观：</strong>{analysis.macroAnalysis}
              </p>
            )}
            {analysis.cryptoAnalysis && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: COLORS.text }}>加密：</strong>{analysis.cryptoAnalysis}
              </p>
            )}
            {analysis.actionSuggestions && (
              <p style={{ margin: 0 }}>
                <strong style={{ color: COLORS.text }}>操作建议：</strong>{analysis.actionSuggestions}
              </p>
            )}
            <div style={{ marginTop: 8 }}>
              <Badge color={COLORS.purple}>AI 生成</Badge>
              {analysis.generatedAt && (
                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                  {formatTimestamp(analysis.generatedAt)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.9, color: COLORS.muted }}>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: COLORS.text }}>宏观：</strong>
              关注美联储政策动向、国债收益率变化和美元指数走势。VIX当前{vixPrice > 20 ? "偏高" : "正常"}，
              市场波动性{vixPrice > 25 ? "较大" : "可控"}。
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: COLORS.text }}>加密：</strong>
              加密恐慌贪婪指数={fearGreed}（{fearGreedLabel}）。
              {fearGreed <= 25 ? "市场处于极度恐慌区域，历史上是中长期优秀买点，但短期可能继续磨底。" : "关注BTC关键支撑位与ETF资金流方向。"}
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: COLORS.text }}>操作建议：</strong>
              {fearGreed <= 25
                ? "加密市场恐慌接近底部区域，建议分批试探性建仓。美股维持正常配置等待财报指引。黄金/XAUT作为避险配置继续持有。"
                : "维持当前配置，关注关键数据和财报。分散投资、控制仓位。"}
            </p>
            <div style={{ marginTop: 8, padding: 8, background: COLORS.dimBg, borderRadius: 6, fontSize: 11, color: "#64748b" }}>
              AI 分析尚未生成。等待每日定时任务运行后，此处将显示 AI 智能分析。
            </div>
          </div>
        )}
      </Card>

      {/* 地缘政治专题 */}
      {analysis && (analysis.iranCeasefire || analysis.hormuzStrait) && (
        <Card title="地缘政治专题" icon="🌍" accent={COLORS.red}>
          <div style={{ fontSize: 13, lineHeight: 1.9, color: COLORS.muted }}>
            {analysis.iranCeasefire && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Badge color={COLORS.red}>伊朗停火</Badge>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>美国-伊朗战争停火进展</span>
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{analysis.iranCeasefire}</div>
              </div>
            )}
            {analysis.hormuzStrait && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Badge color={COLORS.orange}>海峡风险</Badge>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>霍尔木兹海峡封锁风险</span>
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{analysis.hormuzStrait}</div>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>
              <Badge color={COLORS.purple}>AI 生成</Badge>
              <span style={{ marginLeft: 6 }}>数据来源: OpenNews, OpenTwitter, Finnhub</span>
            </div>
          </div>
        </Card>
      )}

      {/* 加密标的动态 */}
      {analysis?.cryptoTopicsAnalysis && (
        <Card title="加密标的动态" icon="🪙" accent={COLORS.accent}>
          <div style={{ fontSize: 13, lineHeight: 1.9, color: COLORS.muted }}>
            <div style={{ whiteSpace: "pre-wrap" }}>{analysis.cryptoTopicsAnalysis}</div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>
              <Badge color={COLORS.purple}>AI 生成</Badge>
              <span style={{ marginLeft: 6 }}>数据来源: OpenNews</span>
            </div>
          </div>
        </Card>
      )}

      {/* 美股标的动态 */}
      {analysis?.stockTopicsAnalysis && (
        <Card title="美股标的动态" icon="📊" accent={COLORS.green}>
          <div style={{ fontSize: 13, lineHeight: 1.9, color: COLORS.muted }}>
            <div style={{ whiteSpace: "pre-wrap" }}>{analysis.stockTopicsAnalysis}</div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>
              <Badge color={COLORS.purple}>AI 生成</Badge>
              <span style={{ marginLeft: 6 }}>数据来源: OpenNews</span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// ========== 市场情绪标签页 ==========
function SentimentTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
  const fearGreedPrev = data?.sentiment?.cryptoFearGreedPrev;
  const fearGreedChange = data?.sentiment?.cryptoFearGreedChange;
  const cnnFG = data?.sentiment?.cnnFearGreed;
  const cnnLabel = data?.sentiment?.cnnFearGreedLabel;
  const vixPrice = data?.indices?.vix?.price ?? 20;
  const vixChange = data?.indices?.vix?.changePercent ?? 0;

  // CNN Fear & Greed 评级逻辑
  const cnnBadge = cnnFG !== null && cnnFG !== undefined
    ? (cnnFG <= 25 ? "🔴 极端恐惧" : cnnFG <= 45 ? "⚠️ 恐惧" : cnnFG <= 55 ? "✅ 中性" : cnnFG <= 75 ? "✅ 贪婪" : "🔴 极端贪婪")
    : "📊 获取中";
  const cnnColor = cnnFG !== null && cnnFG !== undefined
    ? (cnnFG <= 25 ? COLORS.red : cnnFG <= 45 ? COLORS.yellow : cnnFG <= 55 ? COLORS.green : cnnFG <= 75 ? COLORS.green : COLORS.red)
    : COLORS.muted;

  const sentimentIndicators = [
    { name: "CNN恐惧贪婪指数", val: cnnFG !== null && cnnFG !== undefined ? `${cnnFG}/100` : "获取中...", signal: cnnLabel ? `${cnnLabel}` : "美股市场情绪指标", badge: cnnBadge, color: cnnColor },
    { name: "VIX恐慌指数", val: formatPrice(vixPrice), signal: vixPrice > 30 ? "恐慌区间" : vixPrice > 20 ? "偏高但未恐慌" : "正常区间", badge: vixPrice > 30 ? "🔴 恐慌" : vixPrice > 20 ? "⚠️ 关注" : "✅ 正常", color: vixPrice > 30 ? COLORS.red : vixPrice > 20 ? COLORS.yellow : COLORS.green },
    { name: "加密恐惧贪婪", val: `${fearGreed}/100${fearGreedChange !== null && fearGreedChange !== undefined ? ` (${fearGreedChange > 0 ? "+" : ""}${fearGreedChange})` : ""}`, signal: fearGreed <= 10 ? "极度恐惧——历史极端水平！" : fearGreed <= 25 ? "极度恐惧" : fearGreed <= 45 ? "恐惧" : "中性偏上", badge: fearGreed <= 25 ? "🔴 极端" : fearGreed <= 45 ? "⚠️ 恐惧" : "✅ 正常", color: fearGreed <= 25 ? COLORS.red : fearGreed <= 45 ? COLORS.yellow : COLORS.green },
  ];

  return (
    <>
      <Card title="🎯 市场情绪监控报告" icon="" accent={COLORS.yellow}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {["指标", "当前状态", "信号", "评级"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sentimentIndicators.map((r) => (
              <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                <td style={{ padding: "10px 6px", fontWeight: 600, color: COLORS.text, fontSize: 12 }}>{r.name}</td>
                <td style={{ padding: "10px 6px", color: COLORS.muted, fontSize: 12 }}>{r.val}</td>
                <td style={{ padding: "10px 6px", color: COLORS.muted, fontSize: 12 }}>{r.signal}</td>
                <td style={{ padding: "10px 6px" }}><Badge color={r.color}>{r.badge}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="情绪对比：美股 vs 加密" icon="⚡" accent={COLORS.orange}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>美股情绪</div>
            {cnnFG !== null && cnnFG !== undefined && (
              <Gauge value={cnnFG} max={100} label={`CNN Fear & Greed (${cnnFG})`} color={cnnColor} />
            )}
            <Gauge value={vixPrice} max={50} label={`VIX (当前 ${formatPrice(vixPrice)})`} color={vixPrice > 30 ? COLORS.red : vixPrice > 20 ? COLORS.yellow : COLORS.green} />
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
              {cnnFG !== null && cnnFG !== undefined ? `CNN指数=${cnnFG} (${cnnLabel})。` : ""}
              VIX {formatChange(vixChange)}。{vixPrice > 25 ? "波动性偏高，注意控制仓位。" : "波动性正常范围。关注关键财报与宏观数据。"}
            </div>
          </div>
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>加密情绪</div>
            <Gauge value={fearGreed} max={100} label={`Crypto Fear & Greed (${fearGreed})`} color={getFearGreedColor(fearGreed)} />
            {fearGreedPrev !== null && fearGreedPrev !== undefined && (
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                昨日: {fearGreedPrev}
                {fearGreedChange !== null && fearGreedChange !== undefined && (
                  <span style={{ color: fearGreedChange > 0 ? COLORS.green : fearGreedChange < 0 ? COLORS.red : COLORS.muted, marginLeft: 4, fontWeight: 600 }}>
                    {fearGreedChange > 0 ? "+" : ""}{fearGreedChange}
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
              {fearGreed <= 10
                ? "历史性极度恐慌！过去仅2018/2022触及此水平。杠杆多头被清洗。"
                : fearGreed <= 25
                ? "极度恐慌区域，是中长期反向信号。但短期可能继续磨底。"
                : fearGreed <= 45
                ? "市场恐慌情绪偏重，关注支撑位。"
                : "市场情绪中性，等待方向确认。"}
            </div>
          </div>
        </div>
      </Card>

      <Card title="综合评级与仓位建议" icon="💼" accent={COLORS.yellow}>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.yellow }}>📊 中性偏谨慎</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>
            加密恐慌贪婪={fearGreed} | VIX={formatPrice(vixPrice)}
          </div>
        </div>

        {analysis?.actionSuggestions ? (
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8, marginTop: 12, padding: 12, background: COLORS.dimBg, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge color={COLORS.purple}>AI 建议</Badge>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{analysis.actionSuggestions}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8, marginTop: 12 }}>
            <div>• <strong style={{ color: COLORS.text }}>美股：</strong>维持60-70%仓位，关注关键财报指引</div>
            <div>• <strong style={{ color: COLORS.text }}>加密股（HOOD/COIN/CRCL）：</strong>受双重压力（美股波动+加密联动），短期可能承压</div>
            <div>• <strong style={{ color: COLORS.text }}>加密现货：</strong>
              {fearGreed <= 25
                ? "极度恐慌是中长期反向信号，分批建仓优于一次性抄底"
                : "等待更明确的信号再调整仓位"}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ========== 历史对比卡片 ==========
function HistoryComparisonCard({
  currentMetrics,
  currentFearGreed,
  currentBtcPrice,
  history,
}: {
  currentMetrics?: BTCMetrics;
  currentFearGreed: number;
  currentBtcPrice: number | null;
  history?: MetricsHistoryResponse | null;
}) {
  const has = (v: number | null | undefined): v is number =>
    v !== null && v !== undefined;

  // 计算变化并渲染带颜色的 delta
  function renderDelta(current: number | null | undefined, historical: number | null | undefined, inverted = false) {
    if (!has(current) || !has(historical)) return <span style={{ color: COLORS.muted, fontSize: 11 }}>--</span>;
    const diff = current - historical;
    if (Math.abs(diff) < 0.001) return <span style={{ color: COLORS.muted, fontSize: 11 }}>0</span>;
    const isPositive = diff > 0;
    // inverted: 某些指标数值下降反而是利好（如恐慌指数下降 = 更恐慌 = 更接近底部）
    const color = inverted
      ? (isPositive ? COLORS.red : COLORS.green)
      : (isPositive ? COLORS.green : COLORS.red);
    const sign = isPositive ? "+" : "";
    const formatted = Math.abs(diff) >= 100
      ? `${sign}${Math.round(diff)}`
      : Math.abs(diff) >= 1
        ? `${sign}${diff.toFixed(1)}`
        : `${sign}${diff.toFixed(3)}`;
    return <span style={{ color, fontSize: 11, fontWeight: 600 }}>{formatted}</span>;
  }

  // 渲染快照中某指标的值
  function snapshotVal(snapshot: MetricsSnapshot | null | undefined, key: keyof MetricsSnapshot) {
    if (!snapshot) return null;
    const v = snapshot[key];
    return typeof v === "number" ? v : null;
  }

  const indicators: {
    name: string;
    currentVal: number | null | undefined;
    snapshotKey: keyof MetricsSnapshot;
    format: (v: number) => string;
    inverted?: boolean; // true = 下降是利好
  }[] = [
    { name: "BTC 价格", currentVal: currentBtcPrice, snapshotKey: "btcPrice", format: (v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
    { name: "周线 RSI", currentVal: currentMetrics?.weeklyRsi, snapshotKey: "weeklyRsi", format: (v) => v.toFixed(1) },
    { name: "STH-SOPR", currentVal: currentMetrics?.sthSopr, snapshotKey: "sthSopr", format: (v) => v.toFixed(3) },
    { name: "LTH-SOPR", currentVal: currentMetrics?.lthSopr, snapshotKey: "lthSopr", format: (v) => v.toFixed(3) },
    { name: "恐慌贪婪", currentVal: currentFearGreed, snapshotKey: "fearGreed", format: (v) => String(Math.round(v)), inverted: true },
    { name: "LTH 占比", currentVal: currentMetrics?.lthSupplyPercent, snapshotKey: "lthSupplyPct", format: (v) => `${v.toFixed(1)}%` },
    { name: "200WMA 倍数", currentVal: currentMetrics?.wma200Multiplier, snapshotKey: "wma200Multiplier", format: (v) => `${v.toFixed(2)}x` },
  ];

  const hasHistory = history && (history.yesterday || history.oneWeek || history.oneMonth);

  return (
    <Card title="历史对比" icon="📊" accent={COLORS.accent}>
      {!hasHistory ? (
        <div style={{ textAlign: "center", padding: 16, color: COLORS.muted, fontSize: 12 }}>
          <div>暂无历史数据</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            每日定时任务会自动存储指标快照，数据将在运行后逐步积累
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
                <th style={{ textAlign: "left", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>指标</th>
                <th style={{ textAlign: "right", padding: "8px 6px", color: COLORS.text, fontSize: 11 }}>当前</th>
                <th style={{ textAlign: "right", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>vs 昨天</th>
                <th style={{ textAlign: "right", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>vs 1周前</th>
                <th style={{ textAlign: "right", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>vs 1月前</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind) => (
                <tr key={ind.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600, color: COLORS.text, fontSize: 12 }}>{ind.name}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: COLORS.text, fontWeight: 600, fontSize: 12 }}>
                    {has(ind.currentVal) ? ind.format(ind.currentVal) : "--"}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    {renderDelta(ind.currentVal, snapshotVal(history?.yesterday, ind.snapshotKey), ind.inverted)}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    {renderDelta(ind.currentVal, snapshotVal(history?.oneWeek, ind.snapshotKey), ind.inverted)}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>
                    {renderDelta(ind.currentVal, snapshotVal(history?.oneMonth, ind.snapshotKey), ind.inverted)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {history?.yesterday?.date && <span>昨天: {history.yesterday.date}</span>}
            {history?.oneWeek?.date && <span>1周前: {history.oneWeek.date}</span>}
            {history?.oneMonth?.date && <span>1月前: {history.oneMonth.date}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

// ========== BTC 底部分析标签页 ==========
function BTCBottomTab({ data, analysis, history }: { data?: MarketDataResponse; analysis?: AIAnalysis | null; history?: MetricsHistoryResponse | null }) {
  const btc = data?.crypto?.BTC;
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
  const metrics = data?.btcMetrics;

  // --- 辅助：判断值是否有效 ---
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

  // 周线 RSI
  const rsi = metrics?.weeklyRsi;
  const rsiVal = has(rsi) ? `${rsi}` : "计算中...";
  const rsiSignal = has(rsi)
    ? (rsi < 30 ? "RSI<30 已进入超跌区域！" : rsi < 40 ? "RSI偏低，接近超跌" : "RSI在正常范围")
    : "等待数据";
  const rsiBadge = has(rsi)
    ? (rsi < 30 ? "✅ 触发" : rsi < 40 ? "🟡 接近" : "⚪ 正常")
    : "⚪ 待确认";
  const rsiColor = has(rsi)
    ? (rsi < 30 ? COLORS.green : rsi < 40 ? COLORS.yellow : COLORS.muted)
    : COLORS.muted;

  // 成交量变化
  const volChange = metrics?.volumeChangePercent;
  const vol24h = metrics?.volume24h;
  const volVal = has(vol24h)
    ? `$${(vol24h / 1e9).toFixed(1)}B (${has(volChange) ? `${volChange > 0 ? "+" : ""}${volChange.toFixed(0)}%` : "N/A"} vs 30d均值)`
    : "获取中...";
  const volSignal = has(volChange)
    ? (volChange < -50 ? "成交量极度萎缩=卖盘枯竭" : volChange < -20 ? "成交量萎缩，接近底部特征" : "成交量正常")
    : "等待数据";
  const volBadge = has(volChange)
    ? (volChange < -50 ? "✅ 触发" : volChange < -20 ? "🟡 接近" : "⚪ 正常")
    : "⚪ 待确认";
  const volColor = has(volChange)
    ? (volChange < -50 ? COLORS.green : volChange < -20 ? COLORS.yellow : COLORS.muted)
    : COLORS.muted;

  // STH-SOPR（短期持有者已实现利润率）
  const sthSopr = metrics?.sthSopr;
  const sthSoprVal = has(sthSopr) ? sthSopr.toFixed(3) : "数据暂不可用";
  const sthSoprSignal = has(sthSopr)
    ? (sthSopr < 0.90 ? "极度恐慌抛售" : sthSopr < 0.95 ? "短期持有者亏损卖出" : sthSopr < 1.00 ? "接近盈亏平衡" : sthSopr < 1.05 ? "正常获利" : "短期过热")
    : "等待CoinGlass数据";
  const sthSoprBadge = has(sthSopr)
    ? (sthSopr < 0.90 ? "🟢🟢 强底" : sthSopr < 0.95 ? "🟢 抄底" : sthSopr < 1.00 ? "🟡 关注" : sthSopr < 1.05 ? "⚪ 中性" : "🔴 谨慎")
    : "⚪ 待接入";
  const sthSoprColor = has(sthSopr)
    ? (sthSopr < 0.95 ? COLORS.green : sthSopr < 1.00 ? COLORS.yellow : sthSopr >= 1.05 ? COLORS.red : COLORS.muted)
    : COLORS.muted;

  // LTH-SOPR（长期持有者已实现利润率）
  const lthSopr = metrics?.lthSopr;
  const lthSoprVal = has(lthSopr) ? lthSopr.toFixed(3) : "数据暂不可用";
  const lthSoprSignal = has(lthSopr)
    ? (lthSopr < 0.95 ? "长期持有者投降——历史级底部！" : lthSopr < 1.00 ? "长期持有者承压——底部区域" : lthSopr < 2.00 ? "正常分配" : lthSopr < 3.00 ? "大规模获利了结——接近顶部" : "极端获利了结——强烈见顶")
    : "等待CoinGlass数据";
  const lthSoprBadge = has(lthSopr)
    ? (lthSopr < 0.95 ? "🟢🟢 历史底" : lthSopr < 1.00 ? "🟢 底部" : lthSopr < 2.00 ? "⚪ 中性" : lthSopr < 3.00 ? "🟡 见顶" : "🔴 顶部")
    : "⚪ 待接入";
  const lthSoprColor = has(lthSopr)
    ? (lthSopr < 1.00 ? COLORS.green : lthSopr < 2.00 ? COLORS.muted : lthSopr < 3.00 ? COLORS.yellow : COLORS.red)
    : COLORS.muted;

  // LTH Supply
  const lth = metrics?.lthSupplyPercent;
  const lthVal = has(lth) ? `${lth.toFixed(1)}%` : "数据暂不可用";
  const lthSignal = has(lth)
    ? (lth > 70 ? "LTH持仓高——信心强" : "LTH持仓正常")
    : "等待CoinGlass数据";
  const lthBadge = has(lth)
    ? (lth > 70 ? "✅ 触发" : "🟡 关注")
    : "⚪ 待接入";
  const lthColor = has(lth)
    ? (lth > 70 ? COLORS.green : COLORS.yellow)
    : COLORS.muted;

  // 200 WMA
  const wma200 = metrics?.wma200Multiplier;
  const wma200Price = metrics?.wma200Price;
  const wma200Val = has(wma200) ? `${wma200.toFixed(2)}x` : "数据暂不可用";
  const wma200Signal = has(wma200)
    ? (wma200 < 1.0 ? "低于200周均线——历史级底部！" : wma200 < 1.2 ? "接近200周均线支撑" : wma200 < 2.0 ? "正常上涨趋势" : wma200 < 3.5 ? "显著偏离均线——过热" : "极端偏离——周期顶部")
    : "等待CoinGlass数据";
  const wma200Badge = has(wma200)
    ? (wma200 < 1.0 ? "🟢🟢 历史底" : wma200 < 1.2 ? "🟢 抄底" : wma200 < 2.0 ? "⚪ 正常" : wma200 < 3.5 ? "🟡 过热" : "🔴 顶部")
    : "⚪ 待接入";
  const wma200Color = has(wma200)
    ? (wma200 < 1.2 ? COLORS.green : wma200 < 2.0 ? COLORS.muted : wma200 < 3.5 ? COLORS.yellow : COLORS.red)
    : COLORS.muted;

  const btcIndicators = [
    { name: "周线RSI", val: rsiVal, signal: rsiSignal, badge: rsiBadge, color: rsiColor },
    { name: "成交量变化", val: volVal, signal: volSignal, badge: volBadge, color: volColor },
    { name: "STH-SOPR", val: sthSoprVal, signal: sthSoprSignal, badge: sthSoprBadge, color: sthSoprColor },
    { name: "LTH-SOPR", val: lthSoprVal, signal: lthSoprSignal, badge: lthSoprBadge, color: lthSoprColor },
    { name: "恐惧贪婪指数", val: `${fearGreed} / 100`, signal: fearGreed <= 10 ? "极度恐惧——历史极端水平！" : fearGreed <= 25 ? "极度恐惧" : "未到极端", badge: fearGreed <= 25 ? "✅ 触发" : "⚪ 未触发", color: fearGreed <= 25 ? COLORS.green : COLORS.muted },
    { name: "LTH持有者", val: lthVal, signal: lthSignal, badge: lthBadge, color: lthColor },
  ];

  const triggeredCount = btcIndicators.filter(i => i.badge.includes("触发") || i.badge.includes("强底") || i.badge.includes("历史底") || i.badge.includes("抄底") || i.badge.includes("底部")).length;
  const topCount = btcIndicators.filter(i => i.badge.includes("谨慎") || i.badge.includes("见顶") || i.badge.includes("顶部") || i.badge.includes("过热")).length;

  // --- 综合抄底评分 ---
  const scores: number[] = [];
  // STH-SOPR 评分
  if (has(sthSopr)) {
    if (sthSopr < 0.90) scores.push(100);
    else if (sthSopr < 0.95) scores.push(80);
    else if (sthSopr < 1.00) scores.push(60);
    else if (sthSopr < 1.05) scores.push(30);
    else scores.push(0);
  }
  // LTH-SOPR 评分
  if (has(lthSopr)) {
    if (lthSopr < 0.95) scores.push(100);
    else if (lthSopr < 1.00) scores.push(80);
    else if (lthSopr < 2.00) scores.push(50);
    else if (lthSopr < 3.00) scores.push(20);
    else scores.push(0);
  }
  // 恐慌贪婪指数评分
  if (fearGreed <= 10) scores.push(100);
  else if (fearGreed <= 25) scores.push(80);
  else if (fearGreed <= 40) scores.push(50);
  else scores.push(20);
  // 周线 RSI 评分
  if (has(rsi)) {
    if (rsi < 30) scores.push(100);
    else if (rsi < 40) scores.push(70);
    else if (rsi < 50) scores.push(40);
    else scores.push(10);
  }
  // 200WMA 评分
  if (has(wma200)) {
    if (wma200 < 1.0) scores.push(100);
    else if (wma200 < 1.2) scores.push(80);
    else if (wma200 < 2.0) scores.push(50);
    else if (wma200 < 3.5) scores.push(20);
    else scores.push(0);
  }
  // LTH Supply 评分
  if (has(lth)) {
    if (lth > 70) scores.push(80);
    else if (lth > 60) scores.push(50);
    else scores.push(30);
  }
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const scoreLabel = avgScore >= 80 ? "强烈抄底" : avgScore >= 60 ? "偏强" : avgScore >= 40 ? "中性偏强" : avgScore >= 20 ? "中性" : "偏顶部";
  const scoreColor = avgScore >= 80 ? COLORS.green : avgScore >= 60 ? COLORS.green : avgScore >= 40 ? COLORS.yellow : avgScore >= 20 ? COLORS.muted : COLORS.red;

  return (
    <>
      <Card title="🔍 比特币抄底时机分析" icon="" accent={COLORS.orange}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: COLORS.muted }}>BTC 当前价格</span>
          {btc ? (
            <>
              <div style={{ fontSize: 32, fontWeight: 900, color: btc.change24h < 0 ? COLORS.red : COLORS.green }}>
                ${formatPrice(btc.price, true)}
              </div>
              <div style={{ fontSize: 12, color: getChangeColor(btc.change24h) }}>
                24h {formatChange(btc.change24h)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 24, color: COLORS.muted }}>数据加载中...</div>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {["指标", "当前", "信号", "触发?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {btcIndicators.map((r) => (
              <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                <td style={{ padding: "8px 6px", fontWeight: 600, color: COLORS.text }}>{r.name}</td>
                <td style={{ padding: "8px 6px", color: COLORS.muted }}>{r.val}</td>
                <td style={{ padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>{r.signal}</td>
                <td style={{ padding: "8px 6px" }}><Badge color={r.color}>{r.badge}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 历史对比卡片 */}
      <HistoryComparisonCard
        currentMetrics={metrics}
        currentFearGreed={fearGreed}
        currentBtcPrice={btc?.price ?? null}
        history={history}
      />

      {/* 200 周均线专项卡片 */}
      <Card title="200 周均线 (200WMA)" icon="📐" accent={COLORS.purple}>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
          {has(wma200Price) && has(wma200) ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>200WMA 价格</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>${wma200Price.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>当前价格/200WMA</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: wma200Color }}>{wma200.toFixed(2)}x</div>
                </div>
              </div>
              {/* 刻度条 */}
              <div style={{ position: "relative", height: 32, background: COLORS.dimBg, borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
                {/* 渐变背景：绿→灰→黄→红 */}
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, ${COLORS.green}44, ${COLORS.muted}22 30%, ${COLORS.yellow}44 60%, ${COLORS.red}44)`, borderRadius: 6 }} />
                {/* 关键刻度线 */}
                {[
                  { pos: 1.0 / 4.0, label: "1.0" },
                  { pos: 2.0 / 4.0, label: "2.0" },
                  { pos: 3.5 / 4.0, label: "3.5" },
                ].map((m) => (
                  <div key={m.label} style={{ position: "absolute", left: `${m.pos * 100}%`, top: 0, bottom: 0, width: 1, background: `${COLORS.muted}66` }}>
                    <span style={{ position: "absolute", top: -14, left: -8, fontSize: 9, color: COLORS.muted }}>{m.label}</span>
                  </div>
                ))}
                {/* 当前位置指针 */}
                <div style={{
                  position: "absolute",
                  left: `${Math.min(Math.max(wma200 / 4.0, 0), 1) * 100}%`,
                  top: 4, bottom: 4,
                  width: 4, borderRadius: 2,
                  background: wma200Color,
                  transform: "translateX(-2px)",
                  boxShadow: `0 0 6px ${wma200Color}`,
                }} />
              </div>
              <div style={{ fontSize: 11, color: wma200Color, fontWeight: 600, textAlign: "center" }}>
                {wma200Signal}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 12, color: COLORS.muted }}>数据暂不可用</div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.muted, borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 8 }}>
            200周均线是BTC最可靠的长期估值锚，历史上每次触及都是周期大底
          </div>
        </div>
      </Card>

      <Card title="综合抄底评级" icon="🚦" accent={COLORS.orange}>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor }}>
            {avgScore >= 80 ? "🟢 " : avgScore >= 60 ? "🟢 " : avgScore >= 40 ? "🟡 " : avgScore >= 20 ? "⚪ " : "🔴 "}{scoreLabel}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{avgScore} / 100</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
            基于 {scores.length} 个维度评分{" "}
            {triggeredCount > 0 && <span style={{ color: COLORS.green }}>({triggeredCount}个底部信号)</span>}
            {topCount > 0 && <span style={{ color: COLORS.red }}>({topCount}个顶部信号)</span>}
          </div>
        </div>

        {/* AI 分析 */}
        {analysis?.cryptoAnalysis ? (
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, marginTop: 12, fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge color={COLORS.purple}>AI 分析</Badge>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{analysis.cryptoAnalysis}</div>
          </div>
        ) : (
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, marginTop: 12, fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>🎯 建仓参考：</div>
            <div>• 建议分批入场，避免一次性抄底</div>
            <div>• 关注STH-SOPR跌破0.95（短期持有者亏损卖出信号）</div>
            <div>• LTH-SOPR跌破1.0为底部区域，跌破0.95为历史级底部</div>
            <div>• 200WMA倍数接近1.0时为长期最佳买入区间</div>
            <div style={{ marginTop: 8, color: COLORS.yellow }}>
              ⚠️ 多个维度同时触发底部信号时，信号更可靠。耐心等待多维共振！
            </div>
          </div>
        )}
      </Card>

      <Card title="历史参考" icon="📈" accent={COLORS.purple}>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
          <div>恐慌指数触及极端低位的历史记录：</div>
          <div>• <strong style={{ color: COLORS.green }}>2022年6月</strong>：BTC $17.5K → 此后6个月底部形成 → 2023年反弹至$45K (+157%)</div>
          <div>• <strong style={{ color: COLORS.green }}>2018年12月</strong>：BTC $3.2K → 此后筑底3个月 → 2019年反弹至$14K (+337%)</div>
          <div>• <strong style={{ color: COLORS.yellow }}>当前</strong>：恐慌贪婪={fearGreed}，BTC {btc ? `$${formatPrice(btc.price, true)}` : "加载中"}</div>
          <div style={{ marginTop: 8, color: COLORS.purple, fontWeight: 600 }}>
            历史规律：极度恐慌是中长期（3-12月）优秀买点，但不代表立即反弹。底部形成需要时间。
          </div>
        </div>
      </Card>
    </>
  );
}

// ========== 持仓标签页 ==========
function PortfolioTab({ data }: { data?: MarketDataResponse }) {
  return (
    <>
      {/* 美股持仓 */}
      <Card title="📈 美股持仓追踪" icon="" accent={COLORS.accent}>
        {data?.stocks && Object.keys(data.stocks).length > 0 ? (
          Object.entries(data.stocks).map(([ticker, stock]) => {
            const meta = STOCK_META[ticker] || { name: ticker, note: "" };
            const state = getMarketStateLabel(stock.marketState);
            return (
              <div
                key={ticker}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${COLORS.cardBorder}22`,
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 56 }}>
                  <div style={{ fontWeight: 800, color: COLORS.text, fontSize: 14 }}>{ticker}</div>
                  <div style={{ fontSize: 10, color: COLORS.muted }}>{meta.name}</div>
                </div>
                <div style={{ minWidth: 70, textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>${formatPrice(stock.price)}</div>
                  <div style={{ fontSize: 11, color: getChangeColor(stock.changePercent), fontWeight: 600 }}>{formatChange(stock.changePercent)}</div>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, flex: 1 }}>
                  <Badge color={state.color}>{state.text}</Badge>
                  <span style={{ marginLeft: 6 }}>{meta.note}</span>
                </div>
              </div>
            );
          })
        ) : (
          <p style={{ color: COLORS.muted }}>暂无美股数据</p>
        )}
      </Card>

      {/* 加密持仓 */}
      <Card title="₿ 加密持仓追踪" icon="" accent={COLORS.orange}>
        {data?.crypto && Object.keys(data.crypto).length > 0 ? (
          Object.entries(data.crypto).map(([ticker, coin]) => {
            const meta = CRYPTO_META[ticker] || { name: ticker, note: "" };
            return (
              <div
                key={ticker}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${COLORS.cardBorder}22`,
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 56 }}>
                  <div style={{ fontWeight: 800, color: COLORS.text, fontSize: 14 }}>{ticker}</div>
                  <div style={{ fontSize: 10, color: COLORS.muted }}>{meta.name}</div>
                </div>
                <div style={{ minWidth: 80, textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>${formatPrice(coin.price, true)}</div>
                  <div style={{ fontSize: 11, color: getChangeColor(coin.change24h), fontWeight: 600 }}>{formatChange(coin.change24h)}</div>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, flex: 1 }}>{meta.note}</div>
              </div>
            );
          })
        ) : (
          <p style={{ color: COLORS.muted }}>暂无加密货币数据</p>
        )}
      </Card>

      {/* 指数与商品 */}
      <Card title="📊 指数与避险资产" icon="" accent={COLORS.gold}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {data?.indices?.vix && (
            <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: COLORS.muted }}>VIX 恐慌指数</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: data.indices.vix.price > 20 ? COLORS.red : COLORS.green }}>
                {formatPrice(data.indices.vix.price)}
              </div>
              <div style={{ fontSize: 11, color: getChangeColor(data.indices.vix.changePercent), fontWeight: 600 }}>
                {formatChange(data.indices.vix.changePercent)}
              </div>
            </div>
          )}
          {data?.indices?.gold && (
            <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: COLORS.muted }}>黄金 (GC=F)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.gold }}>
                ${formatPrice(data.indices.gold.price)}
              </div>
              <div style={{ fontSize: 11, color: getChangeColor(data.indices.gold.changePercent), fontWeight: 600 }}>
                {formatChange(data.indices.gold.changePercent)}
              </div>
            </div>
          )}
          {data?.indices?.crudeOil && (
            <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: COLORS.muted }}>原油 (CL=F)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>
                ${formatPrice(data.indices.crudeOil.price)}
              </div>
              <div style={{ fontSize: 11, color: getChangeColor(data.indices.crudeOil.changePercent), fontWeight: 600 }}>
                {formatChange(data.indices.crudeOil.changePercent)}
              </div>
            </div>
          )}
          {data?.indices?.dxy && (
            <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: COLORS.muted }}>美元指数 (DXY)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>
                {formatPrice(data.indices.dxy.price)}
              </div>
              <div style={{ fontSize: 11, color: getChangeColor(data.indices.dxy.changePercent), fontWeight: 600 }}>
                {formatChange(data.indices.dxy.changePercent)}
              </div>
            </div>
          )}
        </div>
        {data?.sentiment && (
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: COLORS.muted }}>加密恐慌贪婪指数</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
              {data.sentiment.cryptoFearGreed}
              {data.sentiment.cryptoFearGreedChange !== null && data.sentiment.cryptoFearGreedChange !== undefined && (
                <span style={{ fontSize: 13, marginLeft: 6, color: data.sentiment.cryptoFearGreedChange > 0 ? COLORS.green : data.sentiment.cryptoFearGreedChange < 0 ? COLORS.red : COLORS.muted }}>
                  {data.sentiment.cryptoFearGreedChange > 0 ? "+" : ""}{data.sentiment.cryptoFearGreedChange}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: getFearGreedColor(data.sentiment.cryptoFearGreed), fontWeight: 600 }}>
              {data.sentiment.cryptoFearGreedLabel}
            </div>
            {data.sentiment.cryptoFearGreedPrev !== null && data.sentiment.cryptoFearGreedPrev !== undefined && (
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>
                昨日: {data.sentiment.cryptoFearGreedPrev}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

// ========== 新闻标签页 ==========
function NewsTab({ analysis }: { analysis?: AIAnalysis | null }) {
  const newsItems: NewsItem[] = analysis?.topNews ?? [];
  const hasNews = newsItems.length > 0;

  function getTagColor(tag: string): string {
    if (tag.includes("宏观")) return COLORS.accent;
    if (tag.includes("加密")) return COLORS.orange;
    if (tag.includes("财报")) return COLORS.yellow;
    if (tag.includes("政策") || tag.includes("地缘")) return COLORS.red;
    if (tag.includes("避险")) return COLORS.gold;
    if (tag.includes("科技")) return COLORS.green;
    return COLORS.purple;
  }

  return (
    <Card title="📰 今日必看 10 条新闻" icon="" accent={COLORS.purple}>
      {/* AI 操作建议摘要 */}
      {analysis?.actionSuggestions && (
        <div style={{ marginBottom: 16, padding: 12, background: COLORS.dimBg, borderRadius: 8, border: `1px solid ${COLORS.purple}30` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Badge color={COLORS.purple}>AI 每日摘要</Badge>
            {analysis.generatedAt && (
              <span style={{ fontSize: 11, color: "#64748b" }}>{formatTimestamp(analysis.generatedAt)}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {analysis.actionSuggestions}
          </div>
        </div>
      )}

      {hasNews ? (
        newsItems.map((n, i) => (
          <div
            key={i}
            style={{
              padding: "12px 0",
              borderBottom: i < newsItems.length - 1 ? `1px solid ${COLORS.cardBorder}22` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Badge color={getTagColor(n.tag)}>{n.tag}</Badge>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: COLORS.text,
                  textDecoration: "none",
                  borderBottom: `1px dashed ${COLORS.muted}44`,
                }}
              >
                {n.title}
              </a>
              <span style={{ fontSize: 10, color: "#64748b", marginLeft: "auto", whiteSpace: "nowrap" }}>
                {n.source}
              </span>
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{n.summary}</div>
            {n.action && (
              <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>
                👉 {n.action}
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ padding: 16, textAlign: "center", color: COLORS.muted, fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>新闻数据尚未生成</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            等待每日定时任务运行后，此处将显示 AI 精选的今日必看新闻。
          </div>
        </div>
      )}
    </Card>
  );
}
