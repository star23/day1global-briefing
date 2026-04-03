"use client";
// ========== 每日投资情报仪表板 ==========
// 标签页：总览、流动性、市场情绪、BTC底部、持仓、新闻

import { useState, useEffect, useRef, ReactNode } from "react";
import useSWR from "swr";
import { MarketDataResponse, StockData, BTCMetrics, AIAnalysis, NewsItem, MetricsHistoryResponse, MetricsSnapshot, MarketRating } from "@/lib/types";
import { calculateMarketRating } from "@/lib/market-rating";

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
  { id: "btc-bottom", label: "BTC抄底/逃顶" },
  { id: "portfolio", label: "持仓" },
  { id: "news", label: "新闻" },
];

// ---- 股票/加密元数据 ----
const STOCK_META: Record<string, { name: string; note: string }> = {
  VOO: { name: "S&P 500 ETF", note: "标普500指数ETF，核心配置" },
  QQQ: { name: "Nasdaq 100 ETF", note: "纳指100 ETF，流动性最佳" },
  QQQM: { name: "Nasdaq 100 ETF", note: "纳指100 ETF Mini，费率更低适合长持" },
  NVDA: { name: "英伟达", note: "AI算力龙头，关注财报与Blackwell出货" },
  TSLA: { name: "特斯拉", note: "Physical AI/机器人叙事" },
  GOOG: { name: "Alphabet", note: "AI搜索+云增长，估值相对合理" },
  RKLB: { name: "Rocket Lab", note: "Neutron火箭进展是关键催化剂" },
  CRCL: { name: "Circle", note: "稳定币龙头，ARK持续加仓" },
  HOOD: { name: "Robinhood", note: "加密+零售交易平台" },
  COIN: { name: "Coinbase", note: "加密交易所龙头" },
  TEM: { name: "Tempus AI", note: "AI医疗诊断平台，精准医疗赛道" },
  GLD: { name: "SPDR黄金ETF", note: "全球最大黄金ETF，避险核心配置" },
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

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: open ? COLORS.accent + "44" : COLORS.muted + "33",
          color: open ? COLORS.accent : COLORS.muted,
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          marginLeft: 4,
          verticalAlign: "middle",
        }}
      >
        i
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.5,
            color: COLORS.text,
            whiteSpace: "pre-line",
            zIndex: 100,
            minWidth: 200,
            maxWidth: 280,
            boxShadow: `0 4px 12px ${COLORS.bg}aa`,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function Card({
  title,
  icon,
  children,
  accent = COLORS.accent,
}: {
  title?: ReactNode;
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
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // 音频播放控制
  const toggleAudio = () => {
    if (audioState === "playing") {
      audioRef.current?.pause();
      setAudioState("paused");
      return;
    }
    if (audioState === "paused" && audioRef.current) {
      audioRef.current.play();
      setAudioState("playing");
      return;
    }
    // 首次加载
    setAudioState("loading");
    const audio = new Audio("/api/audio");
    audio.oncanplaythrough = () => {
      audio.play();
      setAudioState("playing");
    };
    audio.onended = () => setAudioState("idle");
    audio.onerror = () => setAudioState("error");
    audioRef.current = audio;
  };

  // 清理音频
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
                <a href="https://github.com/star23/day1global-briefing" target="_blank" rel="noopener noreferrer" title="GitHub" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="https://day1global.xyz/" target="_blank" rel="noopener noreferrer" title="Day1Global" style={{ color: COLORS.muted, display: "inline-flex" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                </a>
              </span>
            </h1>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                日报订阅
                <a href="https://t.me/day1global" target="_blank" rel="noopener noreferrer" title="Telegram 日报订阅" style={{ color: COLORS.muted, display: "inline-flex", alignItems: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
              </span>
              <span style={{ color: "#475569" }}>|</span>
              <button
                onClick={toggleAudio}
                title={audioState === "playing" ? "暂停音频早报" : "收听音频早报"}
                style={{
                  background: audioState === "playing" ? "rgba(99, 102, 241, 0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${audioState === "playing" ? "#6366f1" : "#334155"}`,
                  borderRadius: 16,
                  padding: "2px 10px",
                  color: audioState === "playing" ? "#818cf8" : audioState === "error" ? COLORS.red : COLORS.muted,
                  fontSize: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                }}
              >
                {audioState === "loading" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M6.34 6.34L3.51 3.51"/>
                  </svg>
                ) : audioState === "playing" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : audioState === "error" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
                {audioState === "loading" ? "加载中" : audioState === "playing" ? "暂停" : audioState === "paused" ? "继续播放" : audioState === "error" ? "音频不可用" : "听早报"}
              </button>
              <a
                href="/api/audio?download=1"
                download
                title="下载音频早报 MP3"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid #334155",
                  borderRadius: 16,
                  padding: "2px 10px",
                  color: COLORS.muted,
                  fontSize: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                  textDecoration: "none",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载
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
  if (data?.indices?.sp500) {
    indices.push({ name: "S&P 500", val: formatPrice(data.indices.sp500.price), chg: formatChange(data.indices.sp500.changePercent), color: getChangeColor(data.indices.sp500.changePercent) });
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
    { name: "恐慌贪婪", currentVal: currentFearGreed, snapshotKey: "fearGreed", format: (v) => String(Math.round(v)), inverted: true },
    { name: "LTH-MVRV", currentVal: currentMetrics?.lthMvrv, snapshotKey: "lthMvrv", format: (v) => v.toFixed(2) },
    { name: "NUPL", currentVal: currentMetrics?.nupl, snapshotKey: "nupl", format: (v) => v.toFixed(3) },
    { name: "LTH 占比", currentVal: currentMetrics?.lthSupplyPercent, snapshotKey: "lthSupplyPct", format: (v) => `${v.toFixed(1)}%` },
    { name: "LTH-SOPR", currentVal: currentMetrics?.lthSopr, snapshotKey: "lthSopr", format: (v) => v.toFixed(3) },
    { name: "STH-SOPR", currentVal: currentMetrics?.sthSopr, snapshotKey: "sthSopr", format: (v) => v.toFixed(3) },
    { name: "365日均线倍数", currentVal: currentMetrics?.ma365Ratio, snapshotKey: "ma365Ratio", format: (v) => `${v.toFixed(2)}x` },
    { name: "200WMA 倍数", currentVal: currentMetrics?.wma200Multiplier, snapshotKey: "wma200Multiplier", format: (v) => `${v.toFixed(2)}x` },
    { name: "周线 RSI", currentVal: currentMetrics?.weeklyRsi, snapshotKey: "weeklyRsi", format: (v) => v.toFixed(1) },
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

  // NUPL（全网未实现净盈亏比率）
  const nuplVal = metrics?.nupl;
  const nuplDisplay = has(nuplVal) ? nuplVal.toFixed(3) : "数据暂不可用";
  const nuplSignal = has(nuplVal)
    ? (nuplVal < 0 ? "全网亏损——投降/底部区域" : nuplVal < 0.25 ? "希望/恐惧——早期复苏" : nuplVal < 0.5 ? "乐观——牛市中段" : nuplVal < 0.75 ? "贪婪——注意风险" : "极度贪婪——周期顶部信号")
    : "等待CoinGlass数据";
  const nuplBadge = has(nuplVal)
    ? (nuplVal < 0 ? "🟢🟢 底部" : nuplVal < 0.25 ? "🟢 关注" : nuplVal < 0.5 ? "⚪ 中性" : nuplVal < 0.75 ? "🟡 贪婪" : "🔴 顶部")
    : "⚪ 待接入";
  const nuplColor = has(nuplVal)
    ? (nuplVal < 0 ? COLORS.green : nuplVal < 0.25 ? COLORS.green : nuplVal < 0.5 ? COLORS.muted : nuplVal < 0.75 ? COLORS.yellow : COLORS.red)
    : COLORS.muted;

  // LTH-MVRV（长期持有者市场价值/已实现价值）
  const lthMvrv = metrics?.lthMvrv;
  const lthMvrvDisplay = has(lthMvrv) ? lthMvrv.toFixed(2) : "数据暂不可用";
  const lthMvrvSignal = has(lthMvrv)
    ? (lthMvrv < 1.0 ? "LTH整体浮亏——历史级底部！" : lthMvrv < 1.5 ? "LTH微利——底部区域" : lthMvrv < 3.5 ? "LTH正常盈利" : lthMvrv < 5.0 ? "LTH大幅盈利——接近顶部" : "LTH极端盈利——强烈见顶")
    : "等待CoinGlass数据";
  const lthMvrvBadge = has(lthMvrv)
    ? (lthMvrv < 1.0 ? "🟢🟢 历史底" : lthMvrv < 1.5 ? "🟢 底部" : lthMvrv < 3.5 ? "⚪ 中性" : lthMvrv < 5.0 ? "🟡 见顶" : "🔴 顶部")
    : "⚪ 待接入";
  const lthMvrvColor = has(lthMvrv)
    ? (lthMvrv < 1.5 ? COLORS.green : lthMvrv < 3.5 ? COLORS.muted : lthMvrv < 5.0 ? COLORS.yellow : COLORS.red)
    : COLORS.muted;

  // BTC 365日均线
  const ma365 = metrics?.ma365Ratio;
  const ma365Price = metrics?.ma365Price;
  const ma365Display = has(ma365) ? `${ma365.toFixed(2)}x` : "数据暂不可用";
  const ma365Signal = has(ma365)
    ? (ma365 < 1.0 ? "低于365日均线——偏空/底部区域" : ma365 < 1.1 ? "接近365日均线支撑" : ma365 < 1.5 ? "正常上涨趋势" : "大幅偏离均线——过热")
    : "等待CoinGlass数据";
  const ma365Badge = has(ma365)
    ? (ma365 < 1.0 ? "🟢 抄底" : ma365 < 1.1 ? "🟢 关注" : ma365 < 1.5 ? "⚪ 正常" : "🟡 过热")
    : "⚪ 待接入";
  const ma365Color = has(ma365)
    ? (ma365 < 1.1 ? COLORS.green : ma365 < 1.5 ? COLORS.muted : COLORS.yellow)
    : COLORS.muted;

  // ETF 每日净流入 + 连续天数评估
  const etfFlow = metrics?.etfFlowUsd;
  const etfFlowDays = metrics?.etfFlowDays ?? [];
  const etfFlowVal = has(etfFlow) ? `$${(etfFlow / 1e6).toFixed(1)}M` : "数据暂不可用";

  // 计算连续流入/流出天数（从最新一天开始）
  let consecutiveInflow = 0;
  let consecutiveOutflow = 0;
  for (const v of etfFlowDays) {
    if (v > 0) consecutiveInflow++;
    else break;
  }
  if (consecutiveInflow === 0) {
    for (const v of etfFlowDays) {
      if (v < 0) consecutiveOutflow++;
      else break;
    }
  }

  const etfFlowSignal = has(etfFlow)
    ? (consecutiveOutflow >= 5 ? `连续${consecutiveOutflow}日净流出——强卖出信号`
      : consecutiveOutflow >= 3 ? `连续${consecutiveOutflow}日净流出——偏空`
      : consecutiveInflow >= 3 ? `连续${consecutiveInflow}日净流入——强买入信号`
      : etfFlow > 500e6 ? "大量流入——机构看涨"
      : etfFlow > 100e6 ? "净流入——偏多"
      : etfFlow > -100e6 ? "流入流出平衡"
      : "净流出——偏空")
    : "等待CoinGlass数据";
  const etfFlowBadge = has(etfFlow)
    ? (consecutiveOutflow >= 5 ? "🟢🟢 强卖出"
      : consecutiveInflow >= 3 ? "🔴 强买入"
      : etfFlow > 500e6 ? "🔴 过热" : etfFlow > 100e6 ? "🟡 偏热" : etfFlow > -100e6 ? "⚪ 中性" : etfFlow > -500e6 ? "🟢 偏冷" : "🟢🟢 恐慌")
    : "⚪ 待接入";
  const etfFlowColor = has(etfFlow)
    ? (consecutiveOutflow >= 5 ? COLORS.green
      : consecutiveInflow >= 3 ? COLORS.red
      : etfFlow > 500e6 ? COLORS.red : etfFlow > 100e6 ? COLORS.yellow : etfFlow < -500e6 ? COLORS.green : etfFlow < -100e6 ? COLORS.green : COLORS.muted)
    : COLORS.muted;

  // Funding Rate
  const fundingRate = metrics?.fundingRate;
  // fundingRate 的值已经是百分比数字，如 0.01 表示 0.01%
  const fundingRateVal = has(fundingRate) ? `${fundingRate}%` : "数据暂不可用";
  const fundingRateSignal = has(fundingRate)
    ? (fundingRate > 0.1 ? "资金费率极高——多头拥挤" : fundingRate > 0.03 ? "偏多" : fundingRate > -0.03 ? "中性" : fundingRate > -0.1 ? "偏空" : "资金费率极低——空头拥挤")
    : "等待CoinGlass数据";
  const fundingRateBadge = has(fundingRate)
    ? (fundingRate > 0.1 ? "🔴 过热" : fundingRate > 0.03 ? "🟡 偏热" : fundingRate > -0.03 ? "⚪ 中性" : fundingRate > -0.1 ? "🟢 偏冷" : "🟢🟢 恐慌")
    : "⚪ 待接入";
  const fundingRateColor = has(fundingRate)
    ? (fundingRate > 0.1 ? COLORS.red : fundingRate > 0.03 ? COLORS.yellow : fundingRate < -0.1 ? COLORS.green : fundingRate < -0.03 ? COLORS.green : COLORS.muted)
    : COLORS.muted;

  // 多空比
  const longShort = metrics?.longShortRatio;
  const longShortVal = has(longShort) ? longShort.toFixed(2) : "数据暂不可用";
  const longShortSignal = has(longShort)
    ? (longShort > 1.5 ? "多头大幅占优——警惕反转" : longShort > 1.2 ? "偏多" : longShort > 0.8 ? "多空均衡" : "空头占优——反弹可能")
    : "等待CoinGlass数据";
  const longShortBadge = has(longShort)
    ? (longShort > 1.5 ? "🔴 过热" : longShort > 1.2 ? "🟡 偏热" : longShort > 0.8 ? "⚪ 中性" : "🟢 偏冷")
    : "⚪ 待接入";
  const longShortColor = has(longShort)
    ? (longShort > 1.5 ? COLORS.red : longShort > 1.2 ? COLORS.yellow : longShort < 0.8 ? COLORS.green : COLORS.muted)
    : COLORS.muted;

  // 指标解释 tooltips
  const INDICATOR_TOOLTIPS: Record<string, string> = {
    "ETF 净流入": "BTC现货ETF每日净流入/流出（美元），反映机构资金动向。大量流入=看涨情绪浓厚，大量流出=机构撤退。",
    "Funding Rate": "永续合约资金费率（Binance 8h）：>0多头付费给空头，<0空头付费给多头。极端正值=多头拥挤（警惕回调），负值=空头拥挤（反弹机会）。",
    "多空比": "全球期货交易所多空账户比：>1多头账户占优，<1空头账户占优。极端值通常预示反转。",
    "周线RSI": "相对强弱指数(RSI)：衡量BTC周线级别超买/超卖程度。<30为超跌区域（历史底部信号），>70为超买。",
    "成交量变化": "24小时成交量与30日平均成交量的偏离度。成交量极度萎缩（<-50%）通常意味着卖盘枯竭，是底部特征。",
    "STH-SOPR": "短期持有者已实现利润率(Short-Term Holder SOPR)：短期持有者（<155天）花费的币的盈亏比。<1表示短期持有者在亏损卖出。",
    "LTH-SOPR": "长期持有者已实现利润率(Long-Term Holder SOPR)：长期持有者（>155天）当天实际花费的币的盈亏比。<1表示长期持有者在亏损卖出，是极强底部信号。",
    "恐惧贪婪指数": "加密市场恐惧贪婪指数(0-100)：综合波动率、交易量、社交媒体、调查等维度。≤25为极度恐惧，历史上是较好的中长期买入点。",
    "LTH持有者": "长期持有者供应占比：持币超过155天的地址持有的BTC占流通量的比例。>70%说明长期持有者信心强，筹码集中。",
    "NUPL": "全网未实现净盈亏比率(Net Unrealized Profit/Loss)：=(市值-已实现市值)/市值。<0为全网亏损（底部），>0.75为极度贪婪（顶部）。",
    "LTH-MVRV": "长期持有者市场价值/已实现价值(LTH Market Value to Realized Value)：衡量长期持有者整体浮盈水平。<1为浮亏（底部），>3.5为大幅浮盈（接近顶部）。",
    "365日均线": "BTC 365日移动平均线：长期趋势指标。价格/均线比值<1.0表示低于年线（偏空），>1.5表示大幅偏离（过热）。",
    "200周均线": "200周移动平均线：BTC最可靠的长期估值锚。倍数<1.0为历史级底部，>3.5为极端过热。历史上每次触及都是周期大底。",
  };

  // 每日关注指标
  const dailyIndicators = [
    { name: "ETF 净流入", val: etfFlowVal, signal: etfFlowSignal, badge: etfFlowBadge, color: etfFlowColor, weight: 12 },
    { name: "Funding Rate", val: fundingRateVal, signal: fundingRateSignal, badge: fundingRateBadge, color: fundingRateColor, weight: 8 },
    { name: "多空比", val: longShortVal, signal: longShortSignal, badge: longShortBadge, color: longShortColor, weight: 5 },
    { name: "恐惧贪婪指数", val: `${fearGreed} / 100`, signal: fearGreed <= 10 ? "极度恐惧——历史极端水平！" : fearGreed <= 25 ? "极度恐惧" : "未到极端", badge: fearGreed <= 25 ? "✅ 触发" : "⚪ 未触发", color: fearGreed <= 25 ? COLORS.green : COLORS.muted, weight: 7 },
  ];

  // 每周关注指标
  const weeklyIndicators = [
    { name: "LTH-MVRV", val: lthMvrvDisplay, signal: lthMvrvSignal, badge: lthMvrvBadge, color: lthMvrvColor, weight: 12 },
    { name: "NUPL", val: nuplDisplay, signal: nuplSignal, badge: nuplBadge, color: nuplColor, weight: 11 },
    { name: "LTH-SOPR", val: lthSoprVal, signal: lthSoprSignal, badge: lthSoprBadge, color: lthSoprColor, weight: 9 },
    { name: "STH-SOPR", val: sthSoprVal, signal: sthSoprSignal, badge: sthSoprBadge, color: sthSoprColor, weight: 8 },
    { name: "LTH持有者", val: lthVal, signal: lthSignal, badge: lthBadge, color: lthColor, weight: 7 },
    { name: "365日均线", val: ma365Display, signal: ma365Signal, badge: ma365Badge, color: ma365Color, weight: 6 },
    { name: "200周均线", val: wma200Val, signal: wma200Signal, badge: wma200Badge, color: wma200Color, weight: 6 },
    { name: "周线RSI", val: rsiVal, signal: rsiSignal, badge: rsiBadge, color: rsiColor, weight: 5 },
    { name: "成交量变化", val: volVal, signal: volSignal, badge: volBadge, color: volColor, weight: 4 },
  ];

  const btcIndicators = [...dailyIndicators, ...weeklyIndicators];

  const triggeredCount = btcIndicators.filter(i => i.badge.includes("触发") || i.badge.includes("强底") || i.badge.includes("历史底") || i.badge.includes("抄底") || i.badge.includes("底部") || i.badge.includes("恐慌")).length;
  const topCount = btcIndicators.filter(i => i.badge.includes("谨慎") || i.badge.includes("见顶") || i.badge.includes("顶部") || i.badge.includes("过热")).length;

  // --- 综合抄底/逃顶评级（加权评分系统）---
  const rating: MarketRating | null = metrics
    ? calculateMarketRating(metrics, fearGreed)
    : null;
  // 转换为抄底视角分数（100-逃顶分=抄底分）
  const avgScore = rating ? 100 - rating.totalScore : 0;
  const scoreLabel = rating?.level ?? "数据不足";
  // 颜色：抄底视角 - 逃顶=红色, 恐慌=绿色
  const scoreColor = rating
    ? (rating.totalScore <= 30 ? COLORS.green : rating.totalScore <= 45 ? COLORS.green : rating.totalScore <= 55 ? COLORS.yellow : rating.totalScore <= 70 ? COLORS.orange : COLORS.red)
    : COLORS.muted;

  return (
    <>
      <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>🔍 比特币抄底/逃顶分析<InfoTooltip text={`权重分配（满分100）：\n每日(32)：ETF净流入:12 | Funding Rate:8 | 多空比:5 | 恐惧贪婪:7\n每周(68)：LTH-MVRV:12 | NUPL:11 | LTH-SOPR:9 | STH-SOPR:8 | LTH持有者:7 | 365日均线:6 | 200周均线:6 | 周线RSI:5 | 成交量:4`} /></span>} icon="" accent={COLORS.orange}>
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

        {/* 每日关注 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent, margin: "12px 0 4px 0" }}>每日关注（机构资金流 / 衍生品 / 情绪）{rating && <span style={{ fontWeight: 400, color: COLORS.muted }}> 得分 {(32 - rating.dailyScore).toFixed(1)}</span>}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {["指标", "当前", "信号", "状态"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", color: COLORS.muted, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dailyIndicators.map((r) => (
              <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: COLORS.text, fontSize: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {r.name}
                    {INDICATOR_TOOLTIPS[r.name] && <InfoTooltip text={INDICATOR_TOOLTIPS[r.name]} />}
                  </span>
                </td>
                <td style={{ padding: "6px 4px", color: COLORS.muted }}>{r.val}</td>
                <td style={{ padding: "6px 4px", color: COLORS.muted, fontSize: 11 }}>{r.signal}</td>
                <td style={{ padding: "6px 4px" }}><Badge color={r.color}>{r.badge}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 每周关注 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple, margin: "16px 0 4px 0" }}>每周关注（链上基本面 / 技术动能）{rating && <span style={{ fontWeight: 400, color: COLORS.muted }}> 得分 {(68 - rating.weeklyScore).toFixed(1)}</span>}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              {["指标", "当前", "信号", "状态"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 4px", color: COLORS.muted, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeklyIndicators.map((r) => (
              <tr key={r.name} style={{ borderBottom: `1px solid ${COLORS.cardBorder}22` }}>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: COLORS.text, fontSize: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {r.name}
                    {INDICATOR_TOOLTIPS[r.name] && <InfoTooltip text={INDICATOR_TOOLTIPS[r.name]} />}
                  </span>
                </td>
                <td style={{ padding: "6px 4px", color: COLORS.muted }}>{r.val}</td>
                <td style={{ padding: "6px 4px", color: COLORS.muted, fontSize: 11 }}>{r.signal}</td>
                <td style={{ padding: "6px 4px" }}><Badge color={r.color}>{r.badge}</Badge></td>
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

      <Card title="综合抄底/逃顶评级" icon="🚦" accent={COLORS.orange}>
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor }}>
            {rating ? (rating.totalScore <= 30 ? "🟢 " : rating.totalScore <= 55 ? "🟡 " : "🔴 ") : "⚪ "}{scoreLabel}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{rating ? `${avgScore} / 100` : "N/A"}</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
            加权综合评分（0=逃顶, 100=抄底）
          </div>
          {rating && (
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 11 }}>
              <span style={{ color: COLORS.accent }}>每日: {(32 - rating.dailyScore).toFixed(1)} / 32</span>
              <span style={{ color: COLORS.purple }}>每周: {(68 - rating.weeklyScore).toFixed(1)} / 68</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
            {triggeredCount > 0 && <span style={{ color: COLORS.green }}>({triggeredCount}个底部信号) </span>}
            {topCount > 0 && <span style={{ color: COLORS.red }}>({topCount}个顶部信号)</span>}
          </div>
          {rating && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: COLORS.dimBg, borderRadius: 8, fontSize: 12, color: scoreColor, fontWeight: 600 }}>
              {rating.suggestion}
            </div>
          )}
        </div>

        {/* 评分刻度条 */}
        {rating && (
          <div style={{ position: "relative", height: 28, background: COLORS.dimBg, borderRadius: 6, overflow: "hidden", margin: "12px 0 4px" }}>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, ${COLORS.red}66, ${COLORS.yellow}44 50%, ${COLORS.green}66)`, borderRadius: 6 }} />
            {[20, 40, 60, 80].map((tick) => (
              <div key={tick} style={{ position: "absolute", left: `${tick}%`, top: 0, bottom: 0, width: 1, background: `${COLORS.muted}44` }}>
                <span style={{ position: "absolute", top: -12, left: -6, fontSize: 8, color: COLORS.muted }}>{tick}</span>
              </div>
            ))}
            <div style={{
              position: "absolute",
              left: `${Math.min(Math.max(avgScore, 0), 100)}%`,
              top: 3, bottom: 3,
              width: 6, borderRadius: 3,
              background: scoreColor,
              transform: "translateX(-3px)",
              boxShadow: `0 0 8px ${scoreColor}`,
            }} />
          </div>
        )}

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
          {data?.indices?.sp500 && (
            <div style={{ background: COLORS.dimBg, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: COLORS.muted }}>S&P 500</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: getChangeColor(data.indices.sp500.changePercent) }}>
                {formatPrice(data.indices.sp500.price)}
              </div>
              <div style={{ fontSize: 11, color: getChangeColor(data.indices.sp500.changePercent), fontWeight: 600 }}>
                {formatChange(data.indices.sp500.changePercent)}
              </div>
            </div>
          )}
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
