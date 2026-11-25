import assert from "node:assert/strict";
import { test } from "node:test";
import { accountRatioWeek } from "./binance-account-ratio";

const now = Date.parse("2026-11-25T10:00:00Z");
const sample = (day: number, ratio: unknown, percent?: unknown, hour = 0) => ({
  time: Date.UTC(2026, 10, day, hour), global_account_long_short_ratio: ratio,
  global_account_long_percent: percent,
});

test("latest sample and previous UTC day refer to the same ordered seven-day series", () => {
  const week = accountRatioWeek([sample(25, "2.69", "72.91", 2), sample(24, 2.5),
    sample(25, 2.3), sample(18, 1.4), sample(26, 8), sample(19, 1)], now);
  assert.equal(week.length, 7);
  assert.deepEqual(week[0], { date: "2026-11-19", ratio: 1, longPercent: 50 });
  assert.deepEqual(week[6], { date: "2026-11-25", ratio: 2.69, longPercent: 72.91 });
  assert.equal(week[5].ratio, 2.5);
});

test("uses the latest sample date as anchor and never substitutes an older day for yesterday", () => {
  const week = accountRatioWeek([sample(22, 1.6), sample(24, 2.69, null)], now);
  assert.equal(week[6].date, "2026-11-24");
  assert.equal(week[6].longPercent?.toFixed(1), "72.9");
  assert.deepEqual(week[5], { date: "2026-11-23", ratio: null, longPercent: null });
  assert.equal(week[4].ratio, 1.6);
});

test("invalid records cannot appear as zero or a bearish signal", () => {
  assert.deepEqual(accountRatioWeek([null, {}, sample(25, -1), sample(25, ""), sample(25, null), sample(25, Infinity)], now), []);
});
