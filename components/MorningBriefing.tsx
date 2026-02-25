"use client";
// ========== 每日投资情报仪表板 ==========
// 标签页：总览、流动性、市场情绪、BTC底部、持仓、新闻

import { useState, ReactNode } from "react";
import useSWR from "swr";
import { MarketDataResponse, StockData, BTCMetrics, AIAnalysis, NewsItem } from "@/lib/types";

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
  { id: "liquidity", label: "流动性" },
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
};

const CRYPTO_META: Record<string, { name: string; note: string }> = {
  BTC: { name: "比特币", note: "数字黄金，关注链上指标与ETF资金流" },
  ETH: { name: "以太坊", note: "智能合约平台，RWA生态持续增长" },
  XAUT: { name: "Tether黄金", note: "避险资产，锚定实物黄金" },
  HYPE: { name: "Hyperliquid", note: "去中心化衍生品协议" },
  VIRTUAL: { name: "Virtuals Protocol", note: "AI Agent叙事，高Beta资产" },
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
            {activeTab === "liquidity" && <LiquidityTab analysis={analysis} />}
            {activeTab === "sentiment" && <SentimentTab data={data} analysis={analysis} />}
            {activeTab === "btc-bottom" && <BTCBottomTab data={data} analysis={analysis} />}
            {activeTab === "portfolio" && <PortfolioTab data={data} />}
            {activeTab === "news" && <NewsTab analysis={analysis} />}
          </>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "24px 16px", color: "#64748b", fontSize: 12 }}>
        <a href="https://day1global.xyz/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Day1 Global</a> Briefing — 数据来源: Finnhub, OKX, Alternative.me, Claude AI
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
  if (data?.crypto?.BTC) {
    indices.push({ name: "BTC", val: `$${formatPrice(data.crypto.BTC.price, true)}`, chg: formatChange(data.crypto.BTC.change24h), color: getChangeColor(data.crypto.BTC.change24h) });
  }
  if (data?.crypto?.ETH) {
    indices.push({ name: "ETH", val: `$${formatPrice(data.crypto.ETH.price, true)}`, chg: formatChange(data.crypto.ETH.change24h), color: getChangeColor(data.crypto.ETH.change24h) });
  }

  // 恐慌贪婪数值
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
  const fearGreedLabel = data?.sentiment?.cryptoFearGreedLabel ?? "中性";

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
    </>
  );
}

// ========== 流动性标签页 ==========
function LiquidityTab({ analysis }: { analysis?: AIAnalysis | null }) {
  const liquidityIndicators = [
    { name: "美联储净流动性", val: "关注缩表持续影响", signal: "ON RRP缓冲逐步耗尽", badge: "🟡 关注", color: COLORS.yellow },
    { name: "SOFR利率", val: "联邦基金利率区间内", signal: "在正常范围内波动", badge: "✅ 正常", color: COLORS.green },
    { name: "MOVE指数", val: "美债波动率", signal: "关注是否突破130危险线", badge: "🟡 关注", color: COLORS.yellow },
    { name: "USDJPY/美日利差", val: "关注套利交易平仓风险", signal: "日元套利暂稳", badge: "✅ 正常", color: COLORS.green },
  ];

  return (
    <>
      <Card title="💧 宏观流动性监控报告" icon="" accent={COLORS.accent}>
        <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
          流动性 = 市场里有多少钱在流动。钱多→资产涨；钱少→资产承压
        </div>

        {/* AI 分析覆盖 */}
        {analysis?.macroAnalysis && (
          <div style={{ marginBottom: 16, padding: 12, background: COLORS.dimBg, borderRadius: 8, border: `1px solid ${COLORS.purple}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge color={COLORS.purple}>AI 分析</Badge>
              {analysis.generatedAt && (
                <span style={{ fontSize: 11, color: "#64748b" }}>{formatTimestamp(analysis.generatedAt)}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {analysis.macroAnalysis}
            </div>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {["指标", "当前状态", "信号", "评级"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 6px", color: COLORS.muted, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liquidityIndicators.map((r) => (
              <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                <td style={{ padding: "10px 6px", fontWeight: 600, color: COLORS.text }}>{r.name}</td>
                <td style={{ padding: "10px 6px", color: COLORS.muted, fontSize: 12 }}>{r.val}</td>
                <td style={{ padding: "10px 6px", color: COLORS.muted, fontSize: 12 }}>{r.signal}</td>
                <td style={{ padding: "10px 6px" }}><Badge color={r.color}>{r.badge}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="净流动性构成解析" icon="📊" accent={COLORS.accent}>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>美联储总资产（水池总量）</span><span style={{ color: COLORS.text, fontWeight: 700 }}>缩表持续中 ↓</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>— TGA余额（政府蓄水池）</span><span style={{ color: COLORS.yellow, fontWeight: 700 }}>关注偏高吸收流动性</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>— ON RRP余额（美联储停车场）</span><span style={{ color: COLORS.green, fontWeight: 700 }}>已大幅下降 ↓</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 700 }}>= 净流动性</span><span style={{ color: COLORS.yellow, fontWeight: 800 }}>缓慢收紧中</span>
          </div>
        </div>
        <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12, color: COLORS.muted }}>
          <strong style={{ color: COLORS.yellow }}>⚠️ 关键风险：</strong>ON RRP这个&quot;缓冲垫&quot;已接近用尽。过去两年缩表的痛苦被ON RRP的下降所吸收，现在缓冲减少，未来缩表将更直接影响市场流动性。如果TGA同时上升（财政部发债），流动性将加速收紧。
        </div>
      </Card>

      <Card title="综合评级与建议" icon="🚦" accent={COLORS.yellow}>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.yellow }}>🟡 流动性偏紧</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>关注ON RRP与TGA余额变化</div>
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8, marginTop: 12 }}>
          <div>• <strong style={{ color: COLORS.text }}>美股：</strong>维持正常仓位，密切关注债券市场波动（MOVE指数）</div>
          <div>• <strong style={{ color: COLORS.text }}>加密：</strong>流动性环境不支持大规模加仓，保持谨慎</div>
          <div>• <strong style={{ color: COLORS.text }}>前瞻：</strong>关注FOMC会议对缩表节奏的指引；财政部再融资公告（影响TGA）</div>
        </div>
      </Card>
    </>
  );
}

// ========== 市场情绪标签页 ==========
function SentimentTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
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
    { name: "加密恐惧贪婪", val: `${fearGreed}/100`, signal: fearGreed <= 10 ? "极度恐惧——历史极端水平！" : fearGreed <= 25 ? "极度恐惧" : fearGreed <= 45 ? "恐惧" : "中性偏上", badge: fearGreed <= 25 ? "🔴 极端" : fearGreed <= 45 ? "⚠️ 恐惧" : "✅ 正常", color: fearGreed <= 25 ? COLORS.red : fearGreed <= 45 ? COLORS.yellow : COLORS.green },
    { name: "S&P 500远期PE", val: "~22-23x", signal: "接近历史高位区间", badge: "⚠️ 关注", color: COLORS.yellow },
    { name: "对冲基金杠杆", val: "偏高水平", signal: "高杠杆=波动放大器", badge: "⚠️ 关注", color: COLORS.yellow },
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

// ========== BTC 底部分析标签页 ==========
function BTCBottomTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  const btc = data?.crypto?.BTC;
  const fearGreed = data?.sentiment?.cryptoFearGreed ?? 50;
  const metrics = data?.btcMetrics;

  // 周线 RSI
  const rsi = metrics?.weeklyRsi;
  const rsiVal = rsi !== null && rsi !== undefined ? `${rsi}` : "计算中...";
  const rsiSignal = rsi !== null && rsi !== undefined
    ? (rsi < 30 ? "RSI<30 已进入超跌区域！" : rsi < 40 ? "RSI偏低，接近超跌" : "RSI在正常范围")
    : "等待数据";
  const rsiBadge = rsi !== null && rsi !== undefined
    ? (rsi < 30 ? "✅ 触发" : rsi < 40 ? "🟡 接近" : "⚪ 正常")
    : "⚪ 待确认";
  const rsiColor = rsi !== null && rsi !== undefined
    ? (rsi < 30 ? COLORS.green : rsi < 40 ? COLORS.yellow : COLORS.muted)
    : COLORS.muted;

  // 成交量变化
  const volChange = metrics?.volumeChangePercent;
  const vol24h = metrics?.volume24h;
  const volVal = vol24h !== null && vol24h !== undefined
    ? `$${(vol24h / 1e9).toFixed(1)}B (${volChange !== null && volChange !== undefined ? `${volChange > 0 ? "+" : ""}${volChange.toFixed(0)}%` : "N/A"} vs 30d均值)`
    : "获取中...";
  const volSignal = volChange !== null && volChange !== undefined
    ? (volChange < -50 ? "成交量极度萎缩=卖盘枯竭" : volChange < -20 ? "成交量萎缩，接近底部特征" : "成交量正常")
    : "等待数据";
  const volBadge = volChange !== null && volChange !== undefined
    ? (volChange < -50 ? "✅ 触发" : volChange < -20 ? "🟡 接近" : "⚪ 正常")
    : "⚪ 待确认";
  const volColor = volChange !== null && volChange !== undefined
    ? (volChange < -50 ? COLORS.green : volChange < -20 ? COLORS.yellow : COLORS.muted)
    : COLORS.muted;

  // MVRV（通过加权 SOPR 近似）
  const mvrv = metrics?.mvrv;
  const mvrvVal = mvrv !== null && mvrv !== undefined ? `${mvrv.toFixed(2)}` : "需链上数据源";
  const mvrvSignal = mvrv !== null && mvrv !== undefined
    ? (mvrv < 1.0 ? "MVRV<1.0 持有者整体亏损！" : mvrv < 1.5 ? "偏低但未跌破1.0" : "正常范围")
    : "待接入 CoinGlass API";
  const mvrvBadge = mvrv !== null && mvrv !== undefined
    ? (mvrv < 1.0 ? "✅ 触发" : mvrv < 1.5 ? "🟡 接近" : "⚪ 正常")
    : "⚪ 待接入";
  const mvrvColor = mvrv !== null && mvrv !== undefined
    ? (mvrv < 1.0 ? COLORS.green : mvrv < 1.5 ? COLORS.yellow : COLORS.muted)
    : COLORS.muted;

  // LTH
  const lth = metrics?.lthSupplyPercent;
  const lthVal = lth !== null && lth !== undefined ? `${lth.toFixed(1)}%` : "需链上数据源";
  const lthSignal = lth !== null && lth !== undefined
    ? (lth > 70 ? "LTH持仓高——信心强" : "LTH持仓正常")
    : "待接入 CoinGlass API";
  const lthBadge = lth !== null && lth !== undefined
    ? (lth > 70 ? "✅ 触发" : "🟡 关注")
    : "⚪ 待接入";
  const lthColor = lth !== null && lth !== undefined
    ? (lth > 70 ? COLORS.green : COLORS.yellow)
    : COLORS.muted;

  const btcIndicators = [
    { name: "周线RSI", val: rsiVal, signal: rsiSignal, badge: rsiBadge, color: rsiColor },
    { name: "成交量变化", val: volVal, signal: volSignal, badge: volBadge, color: volColor },
    { name: "MVRV比率", val: mvrvVal, signal: mvrvSignal, badge: mvrvBadge, color: mvrvColor },
    { name: "恐惧贪婪指数", val: `${fearGreed} / 100`, signal: fearGreed <= 10 ? "极度恐惧——历史极端水平！" : fearGreed <= 25 ? "极度恐惧" : "未到极端", badge: fearGreed <= 25 ? "✅ 触发" : "⚪ 未触发", color: fearGreed <= 25 ? COLORS.green : COLORS.muted },
    { name: "矿机关机价", val: "~$55-60K参考", signal: "接近中效矿机成本线时关注", badge: "📊 参考", color: COLORS.muted },
    { name: "LTH长期持有者", val: lthVal, signal: lthSignal, badge: lthBadge, color: lthColor },
  ];

  const triggeredCount = btcIndicators.filter(i => i.badge.includes("触发")).length;
  const nearCount = btcIndicators.filter(i => i.badge.includes("接近")).length;

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
                <td style={{ padding: "8px 6px", color: COLORS.muted }}>{r.signal}</td>
                <td style={{ padding: "8px 6px" }}><Badge color={r.color}>{r.badge}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="综合抄底评级" icon="🚦" accent={COLORS.orange}>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: fearGreed <= 10 ? COLORS.green : fearGreed <= 25 ? COLORS.orange : COLORS.yellow }}>
            {fearGreed <= 10 ? "🟢 偏强" : fearGreed <= 25 ? "🟡 中等偏强" : "🟡 中等"}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>触发指标 {triggeredCount}/6（恐慌指数为核心参考）</div>
          {nearCount > 0 && (
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>+ {nearCount}个指标&quot;接近触发&quot;</div>
          )}
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
            <div>• 关注BTC周线RSI跌破30的超跌信号</div>
            <div>• 等待MVRV跌至1.0附近或矿工投降信号</div>
            <div>• 止损参考：周线收盘跌破矿机关机价区间</div>
            <div style={{ marginTop: 8, color: COLORS.yellow }}>
              ⚠️ 关注鲸鱼（大户）行为——如果大户仍在减持，散户在接盘，真正的底部可能需要更多时间。耐心等待！
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
        </div>
        {data?.sentiment && (
          <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: COLORS.muted }}>加密恐慌贪婪指数</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
              {data.sentiment.cryptoFearGreed}
            </div>
            <div style={{ fontSize: 11, color: getFearGreedColor(data.sentiment.cryptoFearGreed), fontWeight: 600 }}>
              {data.sentiment.cryptoFearGreedLabel}
            </div>
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
