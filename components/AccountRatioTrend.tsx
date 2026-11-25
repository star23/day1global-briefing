import type { AccountRatioDay } from "@/lib/binance-account-ratio";

export default function AccountRatioTrend({ days, color }: { days: AccountRatioDay[]; color: string }) {
  const ratios = days.flatMap(day => day.ratio === null ? [] : [day.ratio]);
  if (!ratios.length) return null;
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const y = (ratio: number) => max === min ? 13 : 23 - 20 * (ratio - min) / (max - min);
  const description = days.map(d => `${d.date}: ${d.ratio?.toFixed(2) ?? "无数据"}`).join("；");
  return <div style={{ marginTop: 3 }}>
    <span>近 7 天走势</span>
    <svg viewBox="0 0 100 26" role="img" aria-label={description}
      style={{ display: "block", width: 100, maxWidth: "100%", height: 26, color }}>
      <title>{description}</title>
      {days.map(({ date, ratio }, i) => {
        if (ratio === null) return null;
        const prev = days[i - 1]?.ratio;
        const x = 5 + i * 15;
        return <g key={date}>
          {prev != null && <line x1={x - 15} y1={y(prev)} x2={x} y2={y(ratio)} stroke="currentColor" strokeWidth="1.5" />}
          <circle cx={x} cy={y(ratio)} r="2" fill="currentColor"><title>{date} · {ratio.toFixed(2)}</title></circle>
        </g>;
      })}
    </svg>
  </div>;
}
