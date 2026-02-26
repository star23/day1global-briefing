// ========== Vercel Postgres 数据库操作 ==========
// 存储每日 BTC 指标快照，供历史对比使用
// 环境变量: POSTGRES_URL (由 Vercel Postgres / Neon 自动注入)

import { sql } from "@vercel/postgres";

/** 建表 (幂等) */
export async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS btc_metrics_daily (
      id         SERIAL PRIMARY KEY,
      date       DATE NOT NULL UNIQUE,
      btc_price  NUMERIC,
      weekly_rsi NUMERIC,
      volume_24h NUMERIC,
      volume_change_pct NUMERIC,
      sth_sopr   NUMERIC,
      lth_sopr   NUMERIC,
      lth_supply_pct NUMERIC,
      wma200_price NUMERIC,
      wma200_multiplier NUMERIC,
      fear_greed INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/** 写入当日指标 (UPSERT: 同一天只保留最新一条) */
export async function upsertDailyMetrics(row: {
  date: string; // YYYY-MM-DD
  btcPrice: number | null;
  weeklyRsi: number | null;
  volume24h: number | null;
  volumeChangePct: number | null;
  sthSopr: number | null;
  lthSopr: number | null;
  lthSupplyPct: number | null;
  wma200Price: number | null;
  wma200Multiplier: number | null;
  fearGreed: number | null;
}) {
  await sql`
    INSERT INTO btc_metrics_daily
      (date, btc_price, weekly_rsi, volume_24h, volume_change_pct,
       sth_sopr, lth_sopr, lth_supply_pct, wma200_price, wma200_multiplier, fear_greed)
    VALUES
      (${row.date}, ${row.btcPrice}, ${row.weeklyRsi}, ${row.volume24h}, ${row.volumeChangePct},
       ${row.sthSopr}, ${row.lthSopr}, ${row.lthSupplyPct}, ${row.wma200Price}, ${row.wma200Multiplier}, ${row.fearGreed})
    ON CONFLICT (date) DO UPDATE SET
      btc_price         = EXCLUDED.btc_price,
      weekly_rsi        = EXCLUDED.weekly_rsi,
      volume_24h        = EXCLUDED.volume_24h,
      volume_change_pct = EXCLUDED.volume_change_pct,
      sth_sopr          = EXCLUDED.sth_sopr,
      lth_sopr          = EXCLUDED.lth_sopr,
      lth_supply_pct    = EXCLUDED.lth_supply_pct,
      wma200_price      = EXCLUDED.wma200_price,
      wma200_multiplier = EXCLUDED.wma200_multiplier,
      fear_greed        = EXCLUDED.fear_greed,
      created_at        = NOW()
  `;
}

/** 查询指定日期的指标 (精确匹配) */
export async function getMetricsByDate(date: string) {
  const { rows } = await sql`
    SELECT * FROM btc_metrics_daily WHERE date = ${date} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * 查询最近 N 天有数据的记录 (倒序)
 * 用于前端趋势图等
 */
export async function getRecentMetrics(limit: number = 30) {
  const { rows } = await sql`
    SELECT * FROM btc_metrics_daily ORDER BY date DESC LIMIT ${limit}
  `;
  return rows;
}

/**
 * 查询历史对比所需的三个时间点:
 * - 昨天 (yesterday)
 * - 一周前 (7 days ago)
 * - 一个月前 (30 days ago)
 *
 * 如果精确日期没有数据，取最近的一条 (±2天窗口)
 */
export async function getComparisonMetrics() {
  const { rows } = await sql`
    WITH targets AS (
      SELECT 'yesterday'::text AS label, (CURRENT_DATE - INTERVAL '1 day')::date AS target
      UNION ALL
      SELECT '1w', (CURRENT_DATE - INTERVAL '7 days')::date
      UNION ALL
      SELECT '1m', (CURRENT_DATE - INTERVAL '30 days')::date
    )
    SELECT DISTINCT ON (t.label)
      t.label,
      m.*
    FROM targets t
    LEFT JOIN btc_metrics_daily m
      ON m.date BETWEEN (t.target - INTERVAL '2 days')::date AND (t.target + INTERVAL '2 days')::date
    ORDER BY t.label, ABS(m.date - t.target) ASC
  `;
  return rows;
}
