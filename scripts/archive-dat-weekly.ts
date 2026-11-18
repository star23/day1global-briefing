import { ensureDatArchive, insertDatSnapshots } from "../lib/dat-weekly-archive";
import { closedDatSnapshots, type DatSnapshot } from "../lib/dat-weekly-snapshot";
import type { DatReport } from "../lib/dat-weekly";
import seed from "../data/dat-weekly-initial.json";

async function main() {
  await ensureDatArchive();
  const seeded = await insertDatSnapshots(seed satisfies DatSnapshot[]);
  const response = await fetch("https://brief.day1global.xyz/api/dat-weekly", { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("DAT report HTTP " + response.status);
  const report: DatReport = await response.json();
  const capturedAt = new Date().toISOString();
  if (!report.weeks?.length || !/^\d{4}-\d{2}-\d{2}$/.test(report.asOf) ||
      Math.abs(Date.parse(capturedAt) - Date.parse(report.asOf)) > 48 * 3600_000) {
    throw new Error("Missing or stale DAT report");
  }
  const snapshots = closedDatSnapshots(report, capturedAt);
  console.log(`DAT archive: ${seeded} seed rows and ${await insertDatSnapshots(snapshots)} new weeks inserted.`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
