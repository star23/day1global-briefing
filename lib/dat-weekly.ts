export const datCompanies = [
  { id: "strategy", name: "Strategy", ticker: "MSTR", url: "https://www.strategy.com/ledger" },
  { id: "strive", name: "Strive", ticker: "ASST", url: "https://strive.com/treasury?tab=acquisitions" },
  { id: "the-blockchain-group", name: "Capital B", ticker: "ALCPB", url: "https://cptlb.com/" },
] as const;

export type DatCompanyId = typeof datCompanies[number]["id"];
export type Purchase = { date: string; btc: number; source: string };
export type CompanyFeed = { id: DatCompanyId; purchases: Purchase[] | null };
export type DatWeek = { start: string; end: string; total: number | null; purchases: Partial<Record<DatCompanyId, Purchase[]>> };
export type DatReport = { asOf: string; unavailable: DatCompanyId[]; weeks: DatWeek[] };

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function readPurchases(payload: unknown): Purchase[] {
  if (!payload || typeof payload !== "object" || !("transactions" in payload) || !Array.isArray(payload.transactions)) {
    throw new Error("Missing treasury transactions");
  }
  const purchases: Purchase[] = [];
  const seen = new Set<string>();
  for (const row of payload.transactions) {
    if (row?.coin_id !== "bitcoin" || row.type !== "buy") continue;
    const { date, holding_net_change: btc, source_url: source } = row;
    if (typeof date !== "number" || !Number.isFinite(new Date(date).getTime()) || date < 1e12 ||
        typeof btc !== "number" || !Number.isFinite(btc) || btc <= 0 ||
        typeof source !== "string" || !/^https?:\/\//i.test(source)) throw new Error("Invalid BTC purchase");
    const key = JSON.stringify([date, btc, source, row.holding_balance]);
    if (seen.has(key)) continue;
    seen.add(key);
    purchases.push({ date: isoDay(date), btc, source });
  }
  return purchases.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDatReport(feeds: CompanyFeed[], now: number): DatReport {
  const today = Math.floor(now / DAY) * DAY;
  // Tuesday through Monday keeps Friday-dated records and the following Monday update together.
  const end = today + ((8 - new Date(today).getUTCDay()) % 7) * DAY;
  const asOf = isoDay(today);
  const weeks: DatWeek[] = Array.from({ length: 12 }, (_, i) => {
    const monday = end - (11 - i) * 7 * DAY;
    return { start: isoDay(monday - 6 * DAY), end: isoDay(monday), total: null, purchases: {} };
  });
  for (const { id, purchases } of feeds) {
    for (const p of purchases ?? []) {
      if (p.date > asOf) continue;
      const week = weeks.find(w => w.start <= p.date && p.date <= w.end);
      if (!week) continue;
      (week.purchases[id] ??= []).push(p);
      week.total = (week.total ?? 0) + p.btc;
    }
  }
  return { asOf, unavailable: feeds.filter(f => f.purchases === null).map(f => f.id), weeks };
}
