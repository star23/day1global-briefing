import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildDatReport, datCompanies } from "./dat-weekly";
import { closedDatSnapshots } from "./dat-weekly-snapshot";
import seed from "../data/dat-weekly-initial.json";

const at = "2026-11-18T08:20:00Z";
const report = buildDatReport(datCompanies.map(({ id }) => ({
  id, purchases: id === "strategy" ? [0.1, 0.2].map(btc => ({ date: "2026-11-16", btc, source: "https://example.org" })) : [],
})), Date.parse(at));

test("freezes closed weeks only, preserves missing disclosures and aggregates in satoshis", () => {
  const snapshots = closedDatSnapshots(report, at);
  assert.equal(snapshots.length, 11);
  assert.equal(snapshots[0].total, null);
  assert.deepEqual(snapshots[10], {
    start: "2026-11-10", end: "2026-11-16", capturedAt: at, total: 0.3,
    companies: { strategy: 0.3, strive: null, "the-blockchain-group": null },
  });
  assert.ok(closedDatSnapshots({ ...report, asOf: "2026-11-16" }, at).every(w => w.end < "2026-11-16"));
});

test("rejects partial feeds and inconsistent totals before archiving", () => {
  assert.throws(() => closedDatSnapshots({ ...report, unavailable: ["strive"] }, at), /Incomplete/);
  assert.throws(() => closedDatSnapshots({ ...report, weeks: [{ ...report.weeks[10], total: 0 }] }, at), /Inconsistent/);
});

test("initial capture consists of distinct closed weeks and reconciles with company totals", () => {
  assert.equal(seed.length, 11);
  assert.equal(new Set(seed.map(w => w.end)).size, seed.length);
  for (const w of seed) {
    assert.ok(w.end < w.capturedAt.slice(0, 10));
    assert.equal(Object.values(w.companies).reduce<number>((total, btc) => total + (btc ?? 0), 0), w.total);
  }
  assert.equal(seed.find(w => w.end === "2026-11-16")?.total, 748);
});
