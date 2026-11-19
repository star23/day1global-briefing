import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllCrypto } from "./fetch-crypto";
import { CRYPTO_TOPICS, STOCK_TOPICS } from "./fetch-geopolitical-news";

test("watchlist feeds and briefing topics cover the requested changes", async t => {
  const oldKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test";
  t.after(() => {
    if (oldKey === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = oldKey;
  });
  const { fetchAllStocks } = await import("./fetch-stocks");
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/0700.HK")) return Response.json({ chart: { result: [
      { meta: { currency: "HKD", regularMarketPrice: 105, chartPreviousClose: 100 } },
    ] } });
    if (url.pathname.endsWith("/market-status")) return Response.json({ isOpen: true });
    if (url.pathname.endsWith("/quote")) return Response.json({ c: 100, dp: 1 });
    if (url.pathname.endsWith("/ticker")) return Response.json({ code: "0", data: [{ last: "10", open24h: "10" }] });
    throw new Error("Unexpected quote request");
  });
  const stocks = await fetchAllStocks();
  const crypto = await fetchAllCrypto();
  assert.equal(Object.keys(stocks).length, 21);
  assert.equal(stocks["0700.HK"].currency, "HKD");
  assert.equal(stocks["0700.HK"].changePercent, 5);
  assert.notEqual(stocks["0700.HK"].marketState, stocks.VTI.marketState);
  const topics = new Set<string>(STOCK_TOPICS.map(t => t.key));
  for (const id of ["0700.HK", "STRC", "PL", "XBI", "NET", "SHOP", "VTI"]) {
    assert.ok(stocks[id] && topics.has(id), id);
  }
  for (const id of ["DRAM", "MRVL", "NBIS", "INTC", "AMD", "QCOM", "RVI", "VCX", "DXYZ"]) {
    assert.ok(!stocks[id] && !topics.has(id), id);
  }
  assert.deepEqual(Object.keys(crypto).sort(), ["BNB", "BTC", "ETH", "HYPE", "SOL", "XAUT"]);
  assert.deepEqual(CRYPTO_TOPICS.map(t => t.key).sort(), Object.keys(crypto).sort());
});
