export const accountRatioLabel = "币安 BTC 合约多空账户比";

export interface AccountRatioDay {
  date: string;
  ratio: number | null;
  longPercent: number | null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function accountRatioWeek(rows: unknown[], now = Date.now()): AccountRatioDay[] {
  const samples = new Map<string, { time: number; ratio: number; longPercent: number }>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const time = finiteNumber(record.time);
    const ratio = finiteNumber(record.global_account_long_short_ratio);
    if (time === null || time < 1e12 || time > now || ratio === null || ratio <= 0) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    const previous = samples.get(date);
    if (previous && previous.time > time) continue;
    const percent = finiteNumber(record.global_account_long_percent);
    const longPercent = percent !== null && percent >= 0 && percent <= 100 ? percent : 100 * (ratio / (1 + ratio));
    samples.set(date, { time, ratio, longPercent });
  }
  const latest = Array.from(samples.keys()).sort().pop();
  if (!latest) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.parse(latest) - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    const sample = samples.get(date);
    return { date, ratio: sample?.ratio ?? null, longPercent: sample?.longPercent ?? null };
  });
}
