"use client";

import { useState } from "react";
import useSWR from "swr";
import { datCompanies, type DatReport, type Purchase } from "@/lib/dat-weekly";
import type { DatSnapshot } from "@/lib/dat-weekly-snapshot";

type Palette = Record<"accent" | "green" | "purple" | "muted" | "text" | "cardBorder" | "dimBg", string>;
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
const sum = (rows: Purchase[]) => rows.reduce((n, r) => n + r.btc, 0);
const short = (date: string) => date.slice(5).replace("-", "/");

async function fetchReport<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("DAT weekly unavailable");
  return res.json();
}

export default function DatWeekly({ colors }: { colors: Palette }) {
  const { data, error } = useSWR<DatReport>("/api/dat-weekly", fetchReport<DatReport>, { dedupingInterval: 60000, refreshInterval: 3600000 });
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: archive, error: archiveError } = useSWR(historyOpen ? "/api/dat-weekly/history" : null, fetchReport<{ snapshots: DatSnapshot[]; source: "database" | "initial-capture" }>);
  const [end, setEnd] = useState<string | null>(null);
  const link = { color: colors.accent, textUnderlineOffset: 2 };
  const palette = [colors.accent, colors.green, colors.purple];
  const weeks = data?.weeks ?? [];
  const week = weeks.find(w => w.end === end) ?? weeks.slice().reverse().find(w => w.total !== null) ?? weeks[weeks.length - 1];
  const max = Math.max(1, ...weeks.map(w => w.total ?? 0));

  return <div style={{ fontSize: 12, color: colors.muted }}>
    {data && week ? <>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px" }}>
        <strong style={{ color: colors.text }}>{week.start} 至 {week.end}</strong>
        <span>已记录买入 <strong style={{ fontSize: 18, color: colors.text }}>{week.total === null ? "暂无记录" : `${fmt.format(week.total)} BTC`}</strong></span>
        {week.end > data.asOf && <span>本期未结束</span>}
      </div>
      {data.unavailable.length > 0 && <p role="status">{datCompanies.filter(c => data.unavailable.includes(c.id)).map(c => c.name).join("、")} 数据暂不可用，合计仅含其余公司。</p>}
      <div role="group" aria-label="选择观察周" style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 3, marginTop: 14 }}>
        {weeks.map((w, i) => {
          const label = `${w.start} 至 ${w.end}：${w.total === null ? "暂无买入记录" : `${fmt.format(w.total)} BTC`}`;
          return <button key={w.end} type="button" title={label} aria-label={label} aria-pressed={w.end === week.end}
            onFocus={() => setEnd(w.end)} onMouseEnter={() => setEnd(w.end)} onClick={() => setEnd(w.end)}
            style={{ background: w.end === week.end ? colors.accent + "12" : "transparent", border: 0, borderBottom: `2px solid ${w.end === week.end ? colors.accent : colors.cardBorder}`, padding: "0 1px", minWidth: 0, cursor: "pointer", color: colors.muted }}>
            <span style={{ height: 84, display: "flex", flexDirection: "column-reverse", alignItems: "center", justifyContent: "flex-start" }}>
              {w.total === null ? <span aria-hidden="true">·</span> : datCompanies.map((c, j) => {
                const rows = w.purchases[c.id];
                return rows && <span key={c.id} aria-hidden="true" style={{ width: "55%", height: `${sum(rows) / max * 100}%`, minHeight: 1, background: palette[j] }} />;
              })}
            </span>
            <span style={{ display: "block", height: 18, fontSize: 10, whiteSpace: "nowrap" }}>{i === 0 || i === 5 || i === 11 ? short(w.end) : ""}</span>
          </button>;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", margin: "12px 0" }}>
        {datCompanies.map((c, i) => {
          const rows = week.purchases[c.id];
          return <div key={c.id}>
            <span style={{ color: palette[i] }}>●</span> {c.name} <strong style={{ color: colors.text }}>{rows ? `${fmt.format(sum(rows))} BTC` : data.unavailable.includes(c.id) ? "暂不可用" : "无记录"}</strong>
            {rows?.map((p, j) => <a key={j} href={p.source} target="_blank" rel="noopener noreferrer" style={{ ...link, marginLeft: 6 }} title={`${p.date} · ${fmt.format(p.btc)} BTC · 原始披露`}>{short(p.date)}{rows.length > 1 ? ` (${fmt.format(p.btc)})` : ""}</a>)}
          </div>;
        })}
      </div>
    </> : <p role="status">{error ? "买入记录暂不可用，可查阅下方公司披露。" : "正在读取企业买入记录…"}</p>}
    <div style={{ borderTop: `1px solid ${colors.cardBorder}`, paddingTop: 8, lineHeight: 1.8 }}>
      最近 12 周，按记录日归入周二至次周一（UTC）。仅统计跟踪公司的 BTC 买入记录，不扣除卖出；无记录不等于零买入。
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 12px" }}><span>数据来源</span>
        <a style={link} href="https://www.coingecko.com/en/treasuries/bitcoin/companies" target="_blank" rel="noopener noreferrer">CoinGecko</a>
        {datCompanies.map(c => <a key={c.id} href={c.url} style={link} target="_blank" rel="noopener noreferrer">{c.name}</a>)}
        <a style={link} href="https://analytics.metaplanet.jp/" target="_blank" rel="noopener noreferrer">Metaplanet（另查，不计入）</a>
      </div>
    </div>
    <details onToggle={e => setHistoryOpen(e.currentTarget.open)} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", color: colors.text }}>历史快照</summary>
      {archive?.source === "initial-capture" && <p role="status">仅显示 2026-11-18 的首批留档，数据库历史暂未载入。</p>}
      {archive?.snapshots.length ? <div style={{ overflowX: "auto", maxHeight: 320 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <caption style={{ textAlign: "left", padding: "8px 0" }}>单位：BTC · 无记录不等于零买入</caption>
          <thead><tr>{["观察周（UTC）", ...datCompanies.map(c => c.name), "合计", "采集日期（UTC）"].map(label =>
            <th key={label} scope="col" style={{ padding: 5 }}>{label}</th>)}</tr></thead>
          <tbody>{archive.snapshots.map(s => <tr key={s.end} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
            <th scope="row" style={{ padding: 5 }}>{s.start} 至 {s.end}</th>
            {datCompanies.map(c => <td key={c.id} style={{ padding: 5 }}>{s.companies[c.id] == null ? "无记录" : fmt.format(s.companies[c.id]!)}</td>)}
            <td style={{ padding: 5, color: colors.text }}>{s.total === null ? "无记录" : fmt.format(s.total)}</td>
            <td style={{ padding: 5 }}>{s.capturedAt.slice(0, 10)}</td>
          </tr>)}</tbody>
        </table>
      </div> : historyOpen && <p role="status">{archiveError ? "暂时无法读取历史快照。" : archive ? "暂无已归档的观察周。" : "正在读取历史快照…"}</p>}
    </details>
  </div>;
}
