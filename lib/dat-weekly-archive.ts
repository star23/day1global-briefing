import { sql } from "@vercel/postgres";
import type { DatSnapshot } from "./dat-weekly-snapshot";

export async function ensureDatArchive() {
  await sql`CREATE TABLE IF NOT EXISTS btc_dat_weekly_snapshots (
    week_end DATE PRIMARY KEY,
    snapshot JSONB NOT NULL
  )`;
}

export async function insertDatSnapshots(snapshots: DatSnapshot[]) {
  const result = await sql`
    INSERT INTO btc_dat_weekly_snapshots (week_end, snapshot)
    SELECT (s->>'end')::date, s FROM jsonb_array_elements(${JSON.stringify(snapshots)}::jsonb) AS s
    ON CONFLICT (week_end) DO NOTHING
  `;
  return result.rowCount;
}

export async function listDatSnapshots(): Promise<DatSnapshot[]> {
  const { rows } = await sql<{ snapshot: DatSnapshot }>`
    SELECT snapshot FROM btc_dat_weekly_snapshots ORDER BY week_end DESC
  `;
  return rows.map(row => row.snapshot);
}
