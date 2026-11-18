import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildDatReport, readPurchases } from "./dat-weekly";

const source = "https://www.sec.gov/example";
const row = { coin_id: "bitcoin", type: "buy", date: Date.parse("2026-11-13"), holding_net_change: 251, source_url: source };

test("uses positive BTC purchase deltas, not balances, sales, or duplicate rows", () => {
  const purchase = { ...row, holding_balance: 43404 };
  const entries = [purchase, purchase, { ...row, type: "sell", holding_net_change: -3 },
    { ...row, coin_id: "ethereum" }, { ...row, date: Date.parse("2026-11-12"), holding_net_change: 0.5 }];
  assert.deepEqual(readPurchases({ transactions: entries }), [
    { date: "2026-11-12", btc: 0.5, source }, { date: "2026-11-13", btc: 251, source },
  ]);
  assert.throws(() => readPurchases({ status: "rate limited" }));
  assert.throws(() => readPurchases({ transactions: [{ ...row, source_url: "javascript:invalid" }] }));
});

test("closes on Monday UTC; keeps next Tuesday separate and ignores future records", () => {
  const report = buildDatReport([
    { id: "strategy", purchases: [{ date: "2026-11-16", btc: 485, source }] },
    { id: "strive", purchases: [{ date: "2026-11-13", btc: 251, source }] },
    { id: "the-blockchain-group", purchases: [
      { date: "2026-11-10", btc: 12, source }, { date: "2026-11-17", btc: 2, source },
      { date: "2026-11-19", btc: 5, source }, { date: "2026-08-31", btc: 10, source },
    ] },
  ], Date.parse("2026-11-18T23:59:59Z"));
  assert.equal(report.weeks.length, 12);
  assert.equal(report.weeks[0].total, null);
  assert.equal(report.weeks[10].start, "2026-11-10");
  assert.equal(report.weeks[10].end, "2026-11-16");
  assert.equal(report.weeks[10].total, 748);
  assert.equal(report.weeks[11].total, 2);
});

test("distinguishes an empty week from a provider failure across the year boundary", () => {
  const report = buildDatReport([{ id: "strive", purchases: null }, { id: "strategy", purchases: [] }], Date.parse("2027-01-04"));
  assert.deepEqual(report.unavailable, ["strive"]);
  assert.deepEqual(report.weeks[11], { start: "2026-12-29", end: "2027-01-04", total: null, purchases: {} });
});
