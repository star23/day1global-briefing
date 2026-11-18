import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBTCMetrics } from "./fetch-btc-metrics";

const day = 86_400_000;
const candles = Array.from({ length: 400 }, (_, i) => [
  String(Date.UTC(2025, 0, 1) + i * day), "0", "0", "0", String(i + 1), "0", "0", "42", "1",
]).reverse();

for (const scenario of ["complete", "missing day", "history unavailable"] as const) {
  test("BTC daily averages: " + scenario, async t => {
    const historyRequests: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: string) => {
      const url = new URL(input);
      let data: string[][] = [];
      if (url.searchParams.get("bar") === "1Dutc") {
        if (url.pathname.endsWith("/candles")) data = candles.slice(0, 300);
        else {
          historyRequests.push(url.searchParams.get("after")!);
          if (scenario === "history unavailable") return new Response(null, { status: 503 });
          // Include the boundary candle twice across pages, as an exchange may do.
          data = candles.slice(299).filter((_, i) => scenario !== "missing day" || i !== 7);
        }
      }
      return Response.json({ code: "0", data });
    });
    const metrics = await fetchBTCMetrics();
    assert.deepEqual(historyRequests, [candles[299][0]]);
    assert.equal(metrics.ma120Price, 341);
    assert.equal(metrics.ma200Price, 301);
    assert.equal(metrics.ma365Price, scenario === "complete" ? 218 : null);
    assert.equal(metrics.ma365Ratio, scenario === "complete" ? 1.83 : null);
    assert.equal(metrics.volume24h, 42);
  });
}
