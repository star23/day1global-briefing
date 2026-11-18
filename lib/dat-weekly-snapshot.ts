import { datCompanies, type DatCompanyId, type DatReport } from "./dat-weekly";

export interface DatSnapshot {
  start: string;
  end: string;
  capturedAt: string;
  companies: Record<DatCompanyId, number | null>;
  total: number | null;
}

export function closedDatSnapshots(report: DatReport, capturedAt: string): DatSnapshot[] {
  if (report.unavailable.length) throw new Error("Incomplete DAT feeds: " + report.unavailable.join(", "));
  return report.weeks.filter(w => w.end < report.asOf).map(w => {
    const companies = {} as DatSnapshot["companies"];
    let totalSats: number | null = null;
    for (const { id } of datCompanies) {
      const rows = w.purchases[id];
      const sats = rows?.length ? rows.reduce((sum, p) => sum + Math.round(p.btc * 1e8), 0) : null;
      companies[id] = sats === null ? null : sats / 1e8;
      if (sats !== null) totalSats = (totalSats ?? 0) + sats;
    }
    if (totalSats !== (w.total === null ? null : Math.round(w.total * 1e8))) {
      throw new Error("Inconsistent DAT total for " + w.end);
    }
    return { start: w.start, end: w.end, companies, total: totalSats === null ? null : totalSats / 1e8, capturedAt };
  });
}
