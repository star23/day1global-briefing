"use client";
// ========== 每日投资情报仪表板 ==========
// 主仪表板组件，包含6个标签页：总览、美股、加密、市场情绪、流动性、BTC分析

import { useState } from "react";
import useSWR from "swr";
import { MarketDataResponse, StockData, CryptoData, AIAnalysis } from "@/lib/types";

// ---- SWR 数据获取函数 ----
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// ---- 辅助函数 ----

/** 格式化价格显示：加密货币根据价格自动调整小数位 */
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

/** 格式化涨跌幅 */
function formatChange(change: number): string {
  if (change === null || change === undefined) return "N/A";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/** 获取涨跌颜色 */
function getChangeColor(change: number): string {
  if (change > 0) return "#10b981";
  if (change < 0) return "#ef4444";
  return "#94a3b8";
}

/** 市场状态中文标签 */
function getMarketStateLabel(state: StockData["marketState"]): { text: string; color: string } {
  switch (state) {
    case "pre": return { text: "盘前", color: "#f59e0b" };
    case "regular": return { text: "交易中", color: "#10b981" };
    case "post": return { text: "盘后", color: "#8b5cf6" };
    default: return { text: "休市", color: "#64748b" };
  }
}

/** 恐慌贪婪指数颜色 */
function getFearGreedColor(value: number): string {
  if (value <= 25) return "#ef4444";
  if (value <= 45) return "#f59e0b";
  if (value <= 55) return "#94a3b8";
  if (value <= 75) return "#10b981";
  return "#3b82f6";
}

/** 格式化最后更新时间 */
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
  { id: "stocks", label: "美股" },
  { id: "crypto", label: "加密货币" },
  { id: "sentiment", label: "市场情绪" },
  { id: "liquidity", label: "流动性" },
  { id: "btc-analysis", label: "BTC 分析" },
];

// ---- 骨架屏组件（加载中占位） ----
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

// ---- 主组件 ----
export default function MorningBriefing() {
  const [activeTab, setActiveTab] = useState("overview");

  // SWR 自动获取市场数据，每5分钟刷新
  const { data, error, isLoading } = useSWR<MarketDataResponse>(
    "/api/market-data",
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,  // 5分钟自动刷新
      revalidateOnFocus: true,          // 切换回页面时刷新
    }
  );

  // SWR 获取 AI 生成的分析内容（每天更新一次，30分钟刷新检查）
  const { data: analysis } = useSWR<AIAnalysis>(
    "/api/analysis",
    fetcher,
    {
      refreshInterval: 30 * 60 * 1000,  // 30分钟检查一次
      revalidateOnFocus: false,          // 不频繁刷新（每天只更新一次）
    }
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17" }}>
      {/* 骨架屏动画 CSS */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* ---- 页面头部 ---- */}
      <header
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          padding: "24px 0 0",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                Day1 Global Briefing
              </h1>
              <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>
                每日全球市场投资情报
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              {data?.timestamp && (
                <p style={{ fontSize: 12, color: "#64748b" }}>
                  最后更新: {formatTimestamp(data.timestamp)}
                </p>
              )}
              {error && (
                <p style={{ fontSize: 12, color: "#ef4444" }}>
                  数据加载失败，请刷新重试
                </p>
              )}
            </div>
          </div>

          {/* ---- 标签页导航 ---- */}
          <nav style={{ display: "flex", gap: 4, overflowX: "auto" }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? "#f1f5f9" : "#94a3b8",
                  background: activeTab === tab.id ? "#1e293b" : "transparent",
                  border: "none",
                  borderRadius: "8px 8px 0 0",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ---- 主内容区域 ---- */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab data={data} />}
            {activeTab === "stocks" && <StocksTab data={data} />}
            {activeTab === "crypto" && <CryptoTab data={data} />}
            {activeTab === "sentiment" && <SentimentTab data={data} analysis={analysis} />}
            {activeTab === "liquidity" && <LiquidityTab analysis={analysis} />}
            {activeTab === "btc-analysis" && <BTCAnalysisTab data={data} analysis={analysis} />}
          </>
        )}
      </main>

      {/* ---- 页脚 ---- */}
      <footer style={{ textAlign: "center", padding: "24px 16px", color: "#64748b", fontSize: 12 }}>
        Day1 Global Briefing — 数据来源: Yahoo Finance, CoinGecko, Alternative.me
      </footer>
    </div>
  );
}

// ========== 卡片组件 ==========
function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #1e293b",
        borderRadius: 12,
        padding: 20,
        ...style,
      }}
    >
      {title && (
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 16 }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

// ========== Badge 标签组件 ==========
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        color: color,
        background: `${color}20`,
        borderRadius: 4,
      }}
    >
      {text}
    </span>
  );
}

// ========== 仪表盘进度条 ==========
function Gauge({ value, max = 100, label, color }: { value: number; max?: number; label?: string; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{label}</div>}
      <div style={{ height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

// ========== 加载状态 ==========
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

// ========== 总览标签页 ==========
function OverviewTab({ data }: { data?: MarketDataResponse }) {
  // 找出第一个股票的市场状态
  const firstStock = data?.stocks ? Object.values(data.stocks)[0] : null;
  const marketState = firstStock ? getMarketStateLabel(firstStock.marketState) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 市场状态 */}
      {marketState && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge text={`美股 ${marketState.text}`} color={marketState.color} />
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}
          </span>
        </div>
      )}

      {/* 指数快览 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {data?.indices.vix && (
          <Card>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>VIX 恐慌指数</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: data.indices.vix.price > 20 ? "#ef4444" : "#10b981" }}>
              {formatPrice(data.indices.vix.price)}
            </div>
            <div style={{ fontSize: 13, color: getChangeColor(data.indices.vix.changePercent) }}>
              {formatChange(data.indices.vix.changePercent)}
            </div>
          </Card>
        )}
        {data?.indices.gold && (
          <Card>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>黄金 (GC=F)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
              ${formatPrice(data.indices.gold.price)}
            </div>
            <div style={{ fontSize: 13, color: getChangeColor(data.indices.gold.changePercent) }}>
              {formatChange(data.indices.gold.changePercent)}
            </div>
          </Card>
        )}
        {data?.sentiment && (
          <Card>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>加密恐慌贪婪指数</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
              {data.sentiment.cryptoFearGreed}
            </div>
            <div style={{ fontSize: 13, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
              {data.sentiment.cryptoFearGreedLabel}
            </div>
          </Card>
        )}
      </div>

      {/* 关键持仓快览 */}
      <Card title="关键持仓速览">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {data?.stocks &&
            Object.entries(data.stocks).map(([ticker, stock]) => (
              <div
                key={ticker}
                style={{
                  padding: "12px",
                  background: "#0a0e17",
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{ticker}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginTop: 4 }}>
                  ${formatPrice(stock.price)}
                </div>
                <div style={{ fontSize: 12, color: getChangeColor(stock.changePercent), marginTop: 2 }}>
                  {formatChange(stock.changePercent)}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* 加密货币快览 */}
      <Card title="加密货币速览">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {data?.crypto &&
            Object.entries(data.crypto).map(([ticker, coin]) => (
              <div
                key={ticker}
                style={{
                  padding: "12px",
                  background: "#0a0e17",
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{ticker}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginTop: 4 }}>
                  ${formatPrice(coin.price, true)}
                </div>
                <div style={{ fontSize: 12, color: getChangeColor(coin.change24h), marginTop: 2 }}>
                  {formatChange(coin.change24h)}
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}

// ========== 美股标签页 ==========
function StocksTab({ data }: { data?: MarketDataResponse }) {
  if (!data?.stocks || Object.keys(data.stocks).length === 0) {
    return <Card><p style={{ color: "#94a3b8" }}>暂无美股数据</p></Card>;
  }

  // 按涨跌幅排序
  const sorted = Object.entries(data.stocks).sort((a, b) => b[1].changePercent - a[1].changePercent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 市场状态提示 */}
      {Object.values(data.stocks)[0] && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge
            text={getMarketStateLabel(Object.values(data.stocks)[0].marketState).text}
            color={getMarketStateLabel(Object.values(data.stocks)[0].marketState).color}
          />
        </div>
      )}

      {/* 指数行情 */}
      <Card title="指数与商品">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {data.indices.vix && (
            <div style={{ padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>VIX 恐慌指数</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: data.indices.vix.price > 20 ? "#ef4444" : "#10b981" }}>
                {formatPrice(data.indices.vix.price)}
              </div>
              <div style={{ fontSize: 12, color: getChangeColor(data.indices.vix.changePercent) }}>
                {formatChange(data.indices.vix.changePercent)}
              </div>
            </div>
          )}
          {data.indices.gold && (
            <div style={{ padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>黄金 (GC=F)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f59e0b" }}>
                ${formatPrice(data.indices.gold.price)}
              </div>
              <div style={{ fontSize: 12, color: getChangeColor(data.indices.gold.changePercent) }}>
                {formatChange(data.indices.gold.changePercent)}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 个股列表 */}
      <Card title="持仓个股">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500 }}>标的</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500 }}>价格</th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500 }}>涨跌幅</th>
                <th style={{ textAlign: "center", padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500 }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(([ticker, stock]) => {
                const state = getMarketStateLabel(stock.marketState);
                return (
                  <tr key={ticker} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "12px", fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{ticker}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontSize: 14, color: "#f1f5f9" }}>
                      ${formatPrice(stock.price)}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontSize: 14, fontWeight: 600, color: getChangeColor(stock.changePercent) }}>
                      {formatChange(stock.changePercent)}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <Badge text={state.text} color={state.color} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ========== 加密货币标签页 ==========
function CryptoTab({ data }: { data?: MarketDataResponse }) {
  if (!data?.crypto || Object.keys(data.crypto).length === 0) {
    return <Card><p style={{ color: "#94a3b8" }}>暂无加密货币数据</p></Card>;
  }

  const sorted = Object.entries(data.crypto).sort((a, b) => b[1].change24h - a[1].change24h);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 恐慌贪婪指数 */}
      {data.sentiment && (
        <Card title="加密市场恐慌贪婪指数">
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `4px solid ${getFearGreedColor(data.sentiment.cryptoFearGreed)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
                {data.sentiment.cryptoFearGreed}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
                {data.sentiment.cryptoFearGreedLabel}
              </div>
              <Gauge
                value={data.sentiment.cryptoFearGreed}
                color={getFearGreedColor(data.sentiment.cryptoFearGreed)}
                label="0 = 极度恐慌 → 100 = 极度贪婪"
              />
            </div>
          </div>
        </Card>
      )}

      {/* 加密货币列表 */}
      <Card title="加密货币行情">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {sorted.map(([ticker, coin]) => (
            <div
              key={ticker}
              style={{
                padding: 16,
                background: "#0a0e17",
                borderRadius: 8,
                border: "1px solid #1e293b",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{ticker}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9", marginTop: 8 }}>
                ${formatPrice(coin.price, true)}
              </div>
              <div style={{ fontSize: 13, color: getChangeColor(coin.change24h), marginTop: 4 }}>
                24h: {formatChange(coin.change24h)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ========== 市场情绪标签页 ==========
function SentimentTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* VIX */}
      <Card title="VIX 恐慌指数">
        {data?.indices.vix ? (
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: data.indices.vix.price > 20 ? "#ef4444" : "#10b981" }}>
              {formatPrice(data.indices.vix.price)}
            </div>
            <div style={{ fontSize: 14, color: getChangeColor(data.indices.vix.changePercent), marginTop: 4 }}>
              {formatChange(data.indices.vix.changePercent)}
            </div>
            <Gauge
              value={Math.min(data.indices.vix.price, 50)}
              max={50}
              color={data.indices.vix.price > 30 ? "#ef4444" : data.indices.vix.price > 20 ? "#f59e0b" : "#10b981"}
              label="VIX: <15 低波动 | 15-20 正常 | 20-30 高波动 | >30 恐慌"
            />
            <div style={{ marginTop: 16, padding: 12, background: "#0a0e17", borderRadius: 8, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              {data.indices.vix.price < 15 && "市场波动性低，投资者情绪乐观。适合稳健配置。"}
              {data.indices.vix.price >= 15 && data.indices.vix.price < 20 && "市场波动性正常，投资者情绪中性。"}
              {data.indices.vix.price >= 20 && data.indices.vix.price < 30 && "市场波动性偏高，注意控制仓位，关注潜在风险事件。"}
              {data.indices.vix.price >= 30 && "市场处于恐慌状态！高波动可能带来交易机会，但需严格控制风险。"}
            </div>
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>VIX 数据加载中...</p>
        )}
      </Card>

      {/* 加密恐慌贪婪 */}
      <Card title="加密市场恐慌贪婪指数">
        {data?.sentiment ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: "50%",
                  border: `5px solid ${getFearGreedColor(data.sentiment.cryptoFearGreed)}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontSize: 32, fontWeight: 700, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
                  {data.sentiment.cryptoFearGreed}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: getFearGreedColor(data.sentiment.cryptoFearGreed) }}>
                  {data.sentiment.cryptoFearGreedLabel}
                </div>
                <div style={{ marginTop: 8, width: 200 }}>
                  <Gauge
                    value={data.sentiment.cryptoFearGreed}
                    color={getFearGreedColor(data.sentiment.cryptoFearGreed)}
                  />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: 12, background: "#0a0e17", borderRadius: 8, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              {data.sentiment.cryptoFearGreed <= 25 && "极度恐慌 — 市场过度悲观，可能是逢低布局的好时机（别人恐慌我贪婪）。"}
              {data.sentiment.cryptoFearGreed > 25 && data.sentiment.cryptoFearGreed <= 45 && "恐慌 — 市场情绪偏负面，密切关注支撑位，谨慎加仓。"}
              {data.sentiment.cryptoFearGreed > 45 && data.sentiment.cryptoFearGreed <= 55 && "中性 — 市场没有明显方向，等待催化剂。"}
              {data.sentiment.cryptoFearGreed > 55 && data.sentiment.cryptoFearGreed <= 75 && "贪婪 — 市场情绪偏乐观，注意不要追高，适当获利了结。"}
              {data.sentiment.cryptoFearGreed > 75 && "极度贪婪 — 市场过热！高度警惕回调风险，考虑减仓。"}
            </div>
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>恐慌贪婪指数加载中...</p>
        )}
      </Card>

      {/* AI 操作建议（如果有 AI 分析数据） */}
      {analysis?.actionSuggestions && (
        <Card title="AI 操作建议">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge text="AI 生成" color="#8b5cf6" />
            {analysis.generatedAt && (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {formatTimestamp(analysis.generatedAt)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {analysis.actionSuggestions}
          </div>
        </Card>
      )}
    </div>
  );
}

// ========== 流动性标签页 ==========
function LiquidityTab({ analysis }: { analysis?: AIAnalysis | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* AI 宏观判断（如果有） */}
      {analysis?.macroAnalysis ? (
        <Card title="AI 宏观判断">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge text="AI 生成" color="#8b5cf6" />
            {analysis.generatedAt && (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {formatTimestamp(analysis.generatedAt)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {analysis.macroAnalysis}
          </div>
        </Card>
      ) : (
        /* 回退内容：没有 AI 分析时显示静态内容 */
        <Card title="全球流动性观察">
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>美联储资产负债表：</strong>
              关注缩表/扩表节奏，QT（量化紧缩）速度放缓对风险资产有利。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>逆回购（RRP）：</strong>
              RRP 余额下降意味着流动性重新流入市场，利好股票和加密资产。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>美债收益率：</strong>
              10Y 国债收益率是资金成本的风向标。收益率下行对成长股和 BTC 有利。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>美元指数（DXY）：</strong>
              美元走弱通常利好大宗商品和新兴市场资产。
            </p>
            <div style={{ marginTop: 16, padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #1e293b" }}>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                AI 分析尚未生成。等待每日定时任务运行后，此处将显示 AI 宏观判断。
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card title="关键宏观日程">
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8 }}>
          <p>关注本周重要经济数据和美联储官员讲话，这些事件可能影响流动性预期：</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>FOMC 会议纪要 / 利率决议</li>
            <li>CPI / PPI 通胀数据</li>
            <li>非农就业报告</li>
            <li>美联储主席讲话</li>
          </ul>
          <div style={{ marginTop: 16, padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #1e293b" }}>
            <p style={{ fontSize: 12, color: "#64748b" }}>
              后续将接入经济日历 API 自动获取日程。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== BTC 分析标签页 ==========
function BTCAnalysisTab({ data, analysis }: { data?: MarketDataResponse; analysis?: AIAnalysis | null }) {
  const btc = data?.crypto?.BTC;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* BTC 当前价格 */}
      <Card title="BTC 实时行情">
        {btc ? (
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#f59e0b" }}>
              ${formatPrice(btc.price, true)}
            </div>
            <div style={{ fontSize: 14, color: getChangeColor(btc.change24h), marginTop: 4 }}>
              24h: {formatChange(btc.change24h)}
            </div>
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>BTC 数据加载中...</p>
        )}
      </Card>

      {/* AI 加密分析 或 回退静态内容 */}
      {analysis?.cryptoAnalysis ? (
        <Card title="AI 加密市场分析">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge text="AI 生成" color="#8b5cf6" />
            {analysis.generatedAt && (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {formatTimestamp(analysis.generatedAt)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {analysis.cryptoAnalysis}
          </div>
        </Card>
      ) : (
        <Card title="BTC 周期分析">
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>减半周期：</strong>
              BTC 第四次减半已于 2024 年 4 月完成。历史上减半后 12-18 个月通常进入牛市主升浪。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>链上指标：</strong>
              关注 MVRV 比率、NUPL（未实现利润/损失）和 SOPR 等指标判断市场阶段。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>ETF 资金流：</strong>
              BTC 现货 ETF 的净流入/流出是重要的短期风向标。持续净流入支撑价格。
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#f1f5f9" }}>关键价位：</strong>
              支撑位和阻力位根据实际行情动态更新。
            </p>
            <div style={{ marginTop: 16, padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #1e293b" }}>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                AI 分析尚未生成。等待每日定时任务运行后，此处将显示 AI 加密市场分析。
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 仓位建议 */}
      <Card title="仓位管理提示">
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8 }}>
          <div style={{ padding: 12, background: "#0a0e17", borderRadius: 8, border: "1px solid #f59e0b30" }}>
            <p style={{ color: "#f59e0b", fontWeight: 600, marginBottom: 8 }}>
              风险提示
            </p>
            <p>
              以上所有内容仅供参考，不构成投资建议。加密货币市场波动极大，请根据自身风险承受能力合理配置仓位。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
